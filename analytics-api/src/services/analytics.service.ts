import { getClicksCollection, ClickDocument } from '../db/mongo.js';

export interface RawClickInput {
  shortCode: string;
  originalUrl: string;
  timestamp?: string | Date;
  ip?: string;
  userAgent?: string;
  referer?: string;
  headers?: Record<string, unknown>;
}

export interface AnalyticsSummary {
  shortCode: string;
  totalClicks: number;
  uniqueVisitors: number;
  clicksByDate: Array<{ date: string; count: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
  topUserAgents: Array<{ userAgent: string; count: number }>;
  recentClicks: Array<{
    timestamp: Date;
    ip: string;
    userAgent: string;
    referer: string;
  }>;
}

export class AnalyticsService {
  async recordClick(input: RawClickInput): Promise<ClickDocument> {
    const collection = getClicksCollection();

    const doc: ClickDocument = {
      shortCode: input.shortCode,
      originalUrl: input.originalUrl || '',
      timestamp: input.timestamp ? new Date(input.timestamp) : new Date(),
      ip: input.ip || 'unknown',
      userAgent: input.userAgent || 'unknown',
      referer: input.referer || 'direct',
      headers: input.headers,
      createdAt: new Date(),
    };

    await collection.insertOne(doc);
    return doc;
  }

  async getSummary(shortCode: string): Promise<AnalyticsSummary> {
    const collection = getClicksCollection();

    // 1. Total clicks
    const totalClicks = await collection.countDocuments({ shortCode });

    if (totalClicks === 0) {
      return {
        shortCode,
        totalClicks: 0,
        uniqueVisitors: 0,
        clicksByDate: [],
        topReferrers: [],
        topUserAgents: [],
        recentClicks: [],
      };
    }

    // 2. Unique visitors (distinct IPs)
    const uniqueIps = await collection.distinct('ip', { shortCode });
    const uniqueVisitors = uniqueIps.length;

    // 3. Clicks grouped by date
    const clicksByDate = await collection
      .aggregate<{ _id: string; count: number }>([
        { $match: { shortCode } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    // 4. Top Referrers
    const topReferrers = await collection
      .aggregate<{ _id: string; count: number }>([
        { $match: { shortCode } },
        {
          $group: {
            _id: { $ifNull: ['$referer', 'direct'] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])
      .toArray();

    // 5. Top User Agents
    const topUserAgents = await collection
      .aggregate<{ _id: string; count: number }>([
        { $match: { shortCode } },
        {
          $group: {
            _id: { $ifNull: ['$userAgent', 'unknown'] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])
      .toArray();

    // 6. Recent Clicks (last 10)
    const recentClicks = await collection
      .find({ shortCode }, { projection: { _id: 0, timestamp: 1, ip: 1, userAgent: 1, referer: 1 } })
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();

    return {
      shortCode,
      totalClicks,
      uniqueVisitors,
      clicksByDate: clicksByDate.map((item) => ({ date: item._id, count: item.count })),
      topReferrers: topReferrers.map((item) => ({
        referrer: item._id === '' ? 'direct' : item._id,
        count: item.count,
      })),
      topUserAgents: topUserAgents.map((item) => ({ userAgent: item._id, count: item.count })),
      recentClicks: recentClicks.map((c) => ({
        timestamp: c.timestamp,
        ip: c.ip,
        userAgent: c.userAgent,
        referer: c.referer,
      })),
    };
  }

  async getRawEvents(shortCode: string, limit: number = 50, skip: number = 0) {
    const collection = getClicksCollection();

    const [events, total] = await Promise.all([
      collection
        .find({ shortCode }, { projection: { _id: 0 } })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments({ shortCode }),
    ]);

    return {
      shortCode,
      total,
      limit,
      skip,
      events,
    };
  }
}

export const analyticsService = new AnalyticsService();
