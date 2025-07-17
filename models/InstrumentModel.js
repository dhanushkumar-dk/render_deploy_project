const mongoose = require("mongoose");

const instrumentSchema = new mongoose.Schema({
  instrumentName: { type: String, required: true },
  instrumentDescription: { type: String },
  category: { type: String, required: true },
  amount: { type: String },
  image: { type: String }, // Store image URL or filename
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  address: { type: String },
  contactNumber: { type: String },
  status: { type: String, default: "available" },
  rentedDate: { type: Date },
  expectedReturnDate: { type: Date },
  renterId: { type: String },
});

module.exports = mongoose.model("Instrument", instrumentSchema);
