const TrainerExamKey = require('../models/TrainerExamKey');
const Exam = require('../models/Exam');
const StudentAttempt = require('../models/StudentAttempt');
const User = require('../models/User');
const Batch = require('../models/Batch');
const TrainingLog = require('../models/TrainingLog');

// GET /api/trainer/exams
// Returns only PUBLISHED exams from the trainer's assigned courses
exports.getAssignedExams = async (req, res) => {
    try {
        const trainerId = req.user._id;

        // Get the trainer's assignedCourses
        const trainer = await User.findById(trainerId).select('assignedCourses collegeId assignedColleges');
        const assignedCourseIds = trainer?.assignedCourses || [];

        // Get all keys for this trainer
        const assignedKeys = await TrainerExamKey.find({ trainerId })
            .populate({
                path: 'examId',
                populate: [
                    { path: 'courseId', select: 'name code' },
                    { path: 'collegeId', select: 'name' }
                ]
            });

        // Filter: only published exams; if trainer has assignedCourses, further filter by them
        const formattedExams = assignedKeys
            .filter(ak => {
                if (!ak.examId || ak.examId.status !== 'published') return false;
                if (assignedCourseIds.length === 0) return true; // No course restriction
                return assignedCourseIds.some(cid => cid.toString() === ak.examId.courseId?._id?.toString());
            })
            .map(ak => ({
                id: ak._id,
                examId: ak.examId?._id,
                title: ak.examId?.title,
                course: ak.examId?.courseId?.name || '—',
                courseCode: ak.examId?.courseId?.code || '—',
                college: ak.examId?.collegeId?.name || '—',
                key: ak.uniqueKey,
                status: ak.examId?.status,
                duration: ak.examId?.duration,
                totalMarks: ak.examId?.totalMarks,
                passingMarks: ak.examId?.passingMarks,
                settings: ak.examId?.settings
            }));

        res.json({ success: true, data: formattedExams });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/trainer/stats
exports.getTrainerStats = async (req, res) => {
    try {
        const trainerId = req.user._id;
        const assignedExamsCount = await TrainerExamKey.countDocuments({ trainerId });
        const attempts = await StudentAttempt.find({ trainerId });

        const totalAttempts = attempts.length;
        const totalPassed = attempts.filter(a => a.result === 'pass').length;
        const passRate = totalAttempts > 0 ? ((totalPassed / totalAttempts) * 100).toFixed(0) : 0;
        const avgScore = totalAttempts > 0 ? (attempts.reduce((s, a) => s + (a.percentage || 0), 0) / totalAttempts).toFixed(1) : 0;

        // Fetch Courses, Batches, and Logs counts
        const totalBatches = await Batch.countDocuments({ trainerId });
        const totalLogs = await TrainingLog.countDocuments({ trainerId });
        const trainer = await User.findById(trainerId);
        const totalCourses = trainer?.assignedCourses?.length || 0;

        // Exam-level breakdown
        const examMap = {};
        attempts.forEach(a => {
            const k = a.examId?.toString();
            if (!k) return;
            if (!examMap[k]) examMap[k] = { total: 0, passed: 0, score: 0 };
            examMap[k].total++;
            if (a.result === 'pass') examMap[k].passed++;
            examMap[k].score += (a.percentage || 0);
        });

        const examBreakdown = await Promise.all(Object.entries(examMap).map(async ([id, s]) => {
            const exam = await Exam.findById(id).select('title courseId').populate('courseId', 'name code');
            return {
                examId: id,
                title: exam?.title || '—',
                course: exam?.courseId?.name || '—',
                total: s.total,
                passed: s.passed,
                avgScore: s.total > 0 ? (s.score / s.total).toFixed(1) : 0,
                passRate: s.total > 0 ? ((s.passed / s.total) * 100).toFixed(0) : 0
            };
        }));

        res.json({
            success: true,
            data: { 
                totalExams: assignedExamsCount, 
                completedSessions: totalAttempts, 
                averagePassRate: passRate, 
                avgScore, 
                totalBatches,
                totalLogs,
                totalCourses,
                examBreakdown 
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/trainer/waiting-room/:key
// Returns students currently in waiting room (joined but not yet started, or active)
exports.getWaitingRoom = async (req, res) => {
    try {
        const { key } = req.params;
        const keyDoc = await TrainerExamKey.findOne({ uniqueKey: key, trainerId: req.user._id })
            .populate({ path: 'examId', populate: [{ path: 'courseId', select: 'name code' }, { path: 'collegeId', select: 'name' }] });

        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid exam key or not authorized' });

        // Get attempts for this key (session)
        const attempts = await StudentAttempt.find({ sessionId: keyDoc._id })
            .select('studentDetails status totalScore percentage result startedAt completedAt violations');

        res.json({
            success: true,
            data: {
                exam: {
                    id: keyDoc.examId?._id,
                    title: keyDoc.examId?.title,
                    course: keyDoc.examId?.courseId?.name,
                    courseCode: keyDoc.examId?.courseId?.code,
                    college: keyDoc.examId?.collegeId?.name,
                    duration: keyDoc.examId?.duration,
                    totalMarks: keyDoc.examId?.totalMarks,
                    passingMarks: keyDoc.examId?.passingMarks,
                    settings: keyDoc.examId?.settings,
                    key: keyDoc.uniqueKey,
                    isStarted: keyDoc.isStarted,
                    isPaused: keyDoc.isPaused,
                    isActive: keyDoc.isActive
                },
                students: attempts.map(a => ({
                    id: a._id,
                    name: a.studentDetails?.name,
                    rollNumber: a.studentDetails?.rollNumber,
                    mobile: a.studentDetails?.mobile,
                    department: a.studentDetails?.department,
                    status: a.status,
                    score: a.totalScore,
                    percentage: a.percentage,
                    result: a.result,
                    startedAt: a.startedAt,
                    completedAt: a.completedAt,
                    violations: (a.violations?.tabSwitches || 0) + (a.violations?.fullScreenExits || 0) + (a.violations?.copyAttempts || 0)
                }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// POST /api/trainer/waiting-room/:key/start
exports.startSession = async (req, res) => {
    try {
        const { key } = req.params;
        const keyDoc = await TrainerExamKey.findOneAndUpdate(
            { uniqueKey: key, trainerId: req.user._id, isActive: true },
            { isStarted: true },
            { new: true }
        ).populate('examId');

        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid or unauthorized exam key' });

        const Notification = require('../models/Notification');
        const trainerName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.phone || req.user.username;
        
        // Avoid duplicate start notifications for the same session
        const existing = await Notification.findOne({
            type: 'exam_started',
            message: { $regex: key }
        });

        if (!existing) {
            const notif = await Notification.create({
                title: 'Exam Session Started',
                message: `Trainer ${trainerName} started the exam session for "${keyDoc.examId?.title || 'Exam'}" (Key: ${key}).`,
                type: 'exam_started',
                collegeId: keyDoc.examId?.collegeId
            });

            // Emit socket notification to active listeners real-time
            const io = req.app.get('socketio');
            if (io) {
                io.emit('new_notification', {
                    ...notif.toObject(),
                    isRead: false
                });
            }
        }
        
        res.json({ success: true, message: 'Session started successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/trainer/course-exams
// Get all exams created by the trainer, regardless of status
exports.getTrainerExams = async (req, res) => {
    try {
        const filter = { createdBy: req.user._id };
        
        const exams = await Exam.find(filter)
            .populate('courseId', 'name code')
            .populate('collegeId', 'name')
            .sort({ createdAt: -1 });

        // Include any keys already assigned to this trainer for these exams
        const keys = await TrainerExamKey.find({ trainerId: req.user._id });
        const Question = require('../models/Question');

        const data = await Promise.all(exams.map(async (e) => {
            const keyDoc = keys.find(k => k.examId.toString() === e._id.toString());
            const questionCount = await Question.countDocuments({ examId: e._id });
            return {
                id: e._id,
                title: e.title,
                course: e.courseId?.name,
                courseCode: e.courseId?.code,
                college: e.collegeId?.name,
                duration: e.duration,
                passingPercentage: e.passingPercentage || 40,
                totalMarks: e.totalMarks,
                status: e.status, // draft or published
                trainerKey: keyDoc ? keyDoc.uniqueKey : null,
                isStarted: keyDoc ? keyDoc.isStarted : false,
                createdBy: e.createdBy,
                questionCount
            };
        }));

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// POST /api/trainer/exams/:id/publish
// Let trainer independently generate a key and open the session
exports.publishTrainerExam = async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id).populate('courseId');
        if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });

        const trainer = await User.findById(req.user._id);

        // Ensure this trainer created the exam
        if (exam.createdBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to publish this exam' });
        }

        // Generate key if it doesn't exist
        let keyDoc = await TrainerExamKey.findOne({ examId: exam._id, trainerId: trainer._id });
        if (!keyDoc) {
            const crypto = require('crypto');
            const randomCode = crypto.randomBytes(2).toString('hex').toUpperCase();
            const examShort = exam.title.substring(0, 2).toUpperCase();
            const uniqueKey = `${exam.courseId.code || 'CRS'}-${examShort}-${randomCode}`;
            
            keyDoc = await TrainerExamKey.create({
                examId: exam._id,
                trainerId: trainer._id,
                uniqueKey
            });
        }

        // Technically, once ANY trainer publishes it, the overall exam status becomes 'published'
        if (exam.status !== 'published') {
            exam.status = 'published';
            await exam.save();
        }

        const io = req.app.get('socketio');
        if (io) {
            io.emit('data_updated', {
                resource: 'exams',
                action: 'publish',
                data: { id: exam._id, title: exam.title, status: exam.status },
                timestamp: new Date()
            });
        }

        res.json({ success: true, message: 'Exam published and access key ready', key: keyDoc.uniqueKey });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// POST /api/trainer/waiting-room/:key/force-submit
// Trainer manually ends the exam for all active students
exports.forceSubmitSession = async (req, res) => {
    try {
        const { key } = req.params;
        const keyDoc = await TrainerExamKey.findOne({ uniqueKey: key, trainerId: req.user._id, isActive: true });
        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid or unauthorized exam key' });

        const activeAttempts = await StudentAttempt.find({ 
            sessionId: keyDoc._id,
            status: { $in: ['started', 'active', 'violated'] } 
        }).populate('examId');

        // Logic from examController's submit operation but applied in batch
        const Question = require('../models/Question');
        const questions = await Question.find({ examId: keyDoc.examId });

        for (const attempt of activeAttempts) {
            let totalScore = 0;
            attempt.answers.forEach(a => {
                const question = questions.find(qu => qu._id.toString() === a.questionId.toString());
                if (question) {
                    let isCorrect = false;
                    const ans = a.answer;
                    if (ans !== undefined && ans !== null && ans !== '') {
                        if (question.type === 'single_correct' || question.type === 'true_false' || question.type === 'mcq') {
                            const correctChoice = question.options?.choices?.find(c => c.isCorrect);
                            const ansStr = Array.isArray(ans) ? ans[0] : ans;
                            if (correctChoice) isCorrect = String(ansStr).trim().toLowerCase() === String(correctChoice.text).trim().toLowerCase();
                        } else if (question.type === 'multiple_correct' || question.type === 'multiple') {
                            const correctChoices = question.options?.choices?.filter(c => c.isCorrect).map(c => String(c.text).trim().toLowerCase()) || [];
                            const ansArr = Array.isArray(ans) ? ans.map(x => String(x).trim().toLowerCase()) : [String(ans).trim().toLowerCase()];
                            if (correctChoices.length === ansArr.length && correctChoices.length > 0) isCorrect = correctChoices.every(c => ansArr.includes(c));
                        } else if (question.type === 'fill_blank' || question.type === 'fill_blanks') {
                            const ansStr = Array.isArray(ans) ? ans[0] : ans;
                            if (question.correctAnswerText) isCorrect = String(ansStr).trim().toLowerCase() === String(question.correctAnswerText).trim().toLowerCase();
                        } else if (question.type === 'numeric') {
                            const ansStr = Array.isArray(ans) ? ans[0] : ans;
                            const parsedAns = parseFloat(ansStr); const parsedCorrect = parseFloat(question.correctAnswerText);
                            isCorrect = (!isNaN(parsedAns) && !isNaN(parsedCorrect) && parsedAns === parsedCorrect);
                        }
                    }
                    a.isCorrect = isCorrect;
                    if (isCorrect) totalScore += question.points || 1;
                }
            });

        const maxScore = attempt.examId.totalMarks || questions.reduce((acc, q) => acc + q.points, 0) || 1;
            attempt.totalScore = totalScore;
            attempt.percentage = (totalScore / maxScore) * 100;
            attempt.result = totalScore >= (attempt.examId.passingMarks || 0) ? 'pass' : 'fail';
            attempt.status = 'completed';
            attempt.completedAt = new Date();
            if (!attempt.violations?.reason) attempt.violations = { ...attempt.violations, reason: 'Force-submitted by Trainer' };
            await attempt.save();
        }

        keyDoc.isActive = false;
        await keyDoc.save();

        res.json({ success: true, message: `Force-submitted ${activeAttempts.length} active sessions and ended the exam.` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.pauseSession = async (req, res) => {
    try {
        const { key } = req.params;
        const keyDoc = await TrainerExamKey.findOneAndUpdate(
            { uniqueKey: key, trainerId: req.user._id },
            { isPaused: true },
            { new: true }
        );
        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid or unauthorized exam key' });
        res.json({ success: true, message: 'Session paused successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.resumeSession = async (req, res) => {
    try {
        const { key } = req.params;
        const keyDoc = await TrainerExamKey.findOneAndUpdate(
            { uniqueKey: key, trainerId: req.user._id },
            { isPaused: false },
            { new: true }
        );
        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid or unauthorized exam key' });
        res.json({ success: true, message: 'Session resumed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.restartSession = async (req, res) => {
    try {
        const { key } = req.params;
        const keyDoc = await TrainerExamKey.findOneAndUpdate(
            { uniqueKey: key, trainerId: req.user._id },
            { isActive: true, isPaused: false, isStarted: true },
            { new: true }
        );
        if (!keyDoc) return res.status(404).json({ success: false, error: 'Invalid or unauthorized exam key' });
        res.json({ success: true, message: 'Session restarted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET /api/trainer/my-colleges-courses
exports.getTrainerCollegesAndCourses = async (req, res) => {
    try {
        const trainer = await User.findById(req.user._id)
            .populate('assignedColleges', 'name')
            .populate('assignedCourses', 'name code');
            
        res.json({
            success: true,
            data: {
                colleges: trainer.assignedColleges || [],
                courses: trainer.assignedCourses || []
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
