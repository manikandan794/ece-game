const express = require('express');
const router = express.Router();

const authCtrl = require('../controllers/authController');
const teamCtrl = require('../controllers/teamController');
const questionCtrl = require('../controllers/questionController');
const roundCtrl = require('../controllers/roundController');
const resultsCtrl = require('../controllers/resultsController');
const settingsCtrl = require('../controllers/settingsController');
const eventRunCtrl = require('../controllers/eventRunController');
const liveCtrl = require('../controllers/liveController');

const {
  verifyToken,
  requireAdmin1,
  requireAdmin2OrHigher
} = require('../middleware/authMiddleware');

// Public Auth Routes
router.post('/auth/admin/login', authCtrl.loginAdmin);
router.post('/auth/team/login', authCtrl.loginTeam);
router.get('/auth/me', verifyToken, authCtrl.getMe);

// Team Management (Admin 1 only for mutations)
router.get('/teams', requireAdmin2OrHigher, teamCtrl.getAllTeams);
router.get('/teams/:id', requireAdmin2OrHigher, teamCtrl.getTeamById);
router.post('/teams', requireAdmin1, teamCtrl.createTeam);
router.put('/teams/:id', requireAdmin1, teamCtrl.updateTeam);
router.delete('/teams/:id', requireAdmin1, teamCtrl.deleteTeam);
router.post('/teams/:id/reset', requireAdmin1, teamCtrl.resetCredentials);
router.post('/teams/:id/status', requireAdmin1, teamCtrl.toggleTeamStatus);
router.post('/teams/bulk-test', requireAdmin1, teamCtrl.generateTestTeams);
router.post('/teams/clear-test', requireAdmin1, teamCtrl.clearTestTeams);

// Question Management
router.get('/questions', requireAdmin2OrHigher, questionCtrl.getAllQuestions);
router.get('/questions/round/:roundId', requireAdmin2OrHigher, questionCtrl.getQuestionsByRound);
router.get('/questions/:id', requireAdmin2OrHigher, questionCtrl.getQuestionById);
router.post('/questions', requireAdmin1, questionCtrl.createQuestion);
router.post('/questions/:id/version', requireAdmin1, questionCtrl.createQuestionVersion);
router.put('/questions/:id', requireAdmin1, questionCtrl.updateQuestion);
router.delete('/questions/:id', requireAdmin1, questionCtrl.deleteQuestion);
router.post('/questions/:id/status', requireAdmin1, questionCtrl.toggleQuestionStatus);
router.post('/questions/reorder', requireAdmin1, questionCtrl.reorderQuestions);

// Round Management
router.get('/rounds', roundCtrl.getAllRounds);
router.get('/rounds/:id', roundCtrl.getRoundById);
router.post('/rounds', requireAdmin1, roundCtrl.createRound);
router.put('/rounds/:id', requireAdmin1, roundCtrl.updateRound);
router.delete('/rounds/:id', requireAdmin1, roundCtrl.deleteRound);
router.post('/rounds/:id/status', requireAdmin1, roundCtrl.toggleRoundStatus);

// Results & Leaderboard (Global & Event-specific)
router.get('/results/leaderboard', resultsCtrl.getLeaderboard);
router.get('/results/export', requireAdmin1, resultsCtrl.exportResultsCsv);

// Live Real-Time Event Monitoring (Public Read-Only)
router.get('/live/overview', liveCtrl.getLiveOverview);
router.get('/live/round/:roundId', liveCtrl.getRoundLiveDetails);

// Date-Wise Event History & Event Runs
router.get('/events', requireAdmin2OrHigher, eventRunCtrl.getEventRuns);
router.get('/events/today', requireAdmin2OrHigher, eventRunCtrl.getTodayEvent);
router.get('/events/:eventRunId', requireAdmin2OrHigher, eventRunCtrl.getEventRunDetails);
router.get('/events/:eventRunId/round/:roundId', requireAdmin2OrHigher, eventRunCtrl.getRoundResultDetails);
router.post('/events', requireAdmin1, eventRunCtrl.createEventRun);
router.post('/events/:eventRunId/complete', requireAdmin1, eventRunCtrl.completeEventRun);
router.get('/events/:eventRunId/export', requireAdmin1, eventRunCtrl.exportEventCsv);
router.get('/events/:eventRunId/export/csv', requireAdmin1, eventRunCtrl.exportEventCsv);

// Settings, Anti-Cheat, System Health
router.get('/settings', settingsCtrl.getSettings);
router.put('/settings', requireAdmin1, settingsCtrl.updateSettings);
router.post('/settings/testing-mode', requireAdmin1, settingsCtrl.toggleTestingMode);
router.get('/settings/health', requireAdmin1, settingsCtrl.getSystemHealth);
router.get('/settings/audit-logs', requireAdmin1, settingsCtrl.getAuditLogs);
router.get('/settings/violations', requireAdmin1, settingsCtrl.getViolations);

module.exports = router;
