const mongoose = require("mongoose");
require("dotenv").config({ path: ".env.local" });

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: "amazon-ads" });
  const db = mongoose.connection.db;

  const d1 = await db.collection("premium_mart_campaign_structure").aggregate([
    { $group: { _id: "$campaignId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 3 }
  ]).toArray();
  console.log("PM dupes:", JSON.stringify(d1));

  const t1 = await db.collection("premium_mart_campaign_structure").countDocuments();
  const u1 = (await db.collection("premium_mart_campaign_structure").distinct("campaignId")).length;
  console.log("PM total=" + t1 + " unique=" + u1);

  const d2 = await db.collection("norcalway_campaign_structure").aggregate([
    { $group: { _id: "$campaignId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 3 }
  ]).toArray();
  console.log("NC dupes:", JSON.stringify(d2));

  const t2 = await db.collection("norcalway_campaign_structure").countDocuments();
  const u2 = (await db.collection("norcalway_campaign_structure").distinct("campaignId")).length;
  console.log("NC total=" + t2 + " unique=" + u2);

  if (d1.length > 0) {
    const s = await db.collection("premium_mart_campaign_structure")
      .find({ campaignId: d1[0]._id })
      .project({ campaignId: 1, name: 1, keyword: 1, bid: 1, dailyBudget: 1, status: 1 })
      .limit(4).toArray();
    console.log("\nSample PM campaign with dupes (" + d1[0]._id + "):");
    s.forEach(r => console.log("  ", JSON.stringify(r)));
  }

  const h = await db.collection("campaignhistories").countDocuments().catch(() => 0);
  console.log("\nHistory docs:", h);
  if (h > 0) {
    const hs = await db.collection("campaignhistories").find().sort({ changedAt: -1 }).limit(3).toArray();
    hs.forEach(r => console.log("  ", JSON.stringify(r)));
  }

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
