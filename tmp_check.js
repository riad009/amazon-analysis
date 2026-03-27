const mongoose = require("mongoose");
const URI = "mongodb+srv://riad009:G6qTkrCXOAQgetIS@cluster0.xteu4ue.mongodb.net/maldives-booking?retryWrites=true&w=majority";

async function main() {
    await mongoose.connect(URI);
    const db = mongoose.connection.db;

    // List all collections
    const collections = await db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name).join(", "));

    // Find and show all CronSettings docs
    for (const name of ["cronsettings", "CronSettings"]) {
        try {
            const docs = await db.collection(name).find().toArray();
            console.log(`\n${name}:`, JSON.stringify(docs, null, 2));
        } catch (e) {
            // ignore
        }
    }

    // Force clear lock on all possible collections
    for (const name of collections.map(c => c.name)) {
        try {
            const res = await db.collection(name).updateMany(
                { isFetching: true },
                { $set: { isFetching: false } }
            );
            if (res.modifiedCount > 0) {
                console.log(`\nCleared lock in ${name}: ${res.modifiedCount}`);
            }
        } catch (e) {
            // ignore
        }
    }

    await mongoose.disconnect();
}

main().catch(console.error);
