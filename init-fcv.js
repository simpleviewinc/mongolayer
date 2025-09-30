db = db.getSiblingDB("admin");
db.adminCommand({ setFeatureCompatibilityVersion: "7.0", confirm: true });
