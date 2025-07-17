const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FormDataModel",
    required: true,
  },
  userName: { type: String, required: true },
  message: { type: String, required: true },
  dateTime: { type: Date, default: Date.now },
  likedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "FormDataModel" }],
});

module.exports = mongoose.model("Post", postSchema);
