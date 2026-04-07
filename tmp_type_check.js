const mongoose = require("mongoose");
require("dotenv").config({ path: ".env.local" });

async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: "amazon-ads" });
  const db = mongoose.connection.db;

  // Check actual stored types
  const sample = await db.collection("premium_mart_campaign_structure").findOne();
  console.log("campaignId type:", typeof sample.campaignId, "value:", sample.campaignId);
  console.log("profileId type:", typeof sample.profileId, "value:", sample.profileId);
  console.log("dailyBudget type:", typeof sample.dailyBudget, "value:", sample.dailyBudget);
  console.log("bid type:", typeof sample.bid, "value:", sample.bid);
  console.log("status type:", typeof sample.status, "value:", sample.status);

  // Try findOne with string vs number
  const cid = String(sample.campaignId);
  const pid = String(sample.profileId);
  
  const byStr = await db.collection("premium_mart_campaign_structure").findOne({ 
    profileId: pid, campaignId: cid 
  });
  console.log("\nfindOne with STRING campaignId:", byStr ? "FOUND" : "NOT FOUND");

  const byNum = await db.collection("premium_mart_campaign_structure").findOne({ 
    profileId: pid, campaignId: Number(cid) 
  });
  console.log("findOne with NUMBER campaignId:", byNum ? "FOUND" : "NOT FOUND");

  // Also check norcalway
  const sample2 = await db.collection("norcalway_campaign_structure").findOne();
  console.log("\nnorcalway campaignId type:", typeof sample2.campaignId, "value:", sample2.campaignId);

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
