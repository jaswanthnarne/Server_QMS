const mongoose = require('mongoose');

const trainingLogSchema = new mongoose.Schema({
    trainerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College',
        required: true
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    logDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    batches: [{
        batchName: { type: String, required: true },
        timeSlot: { type: String, required: true },
        department: { type: String, required: true },
        moduleTaught: { type: String, required: true },
        actualCount: { type: Number, required: true },
        presentCount: { type: Number, required: true },
        topicsCovered: String
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('TrainingLog', trainingLogSchema);
