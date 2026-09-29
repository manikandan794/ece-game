import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { api } from '../../services/api';
import { 
  Users, HelpCircle, Layers, Award, ShieldAlert, Settings, 
  PlayCircle, Download, RefreshCw, Plus, Edit2, Trash2, Key, 
  CheckCircle2, XCircle, AlertTriangle, Monitor, ExternalLink, LogOut, Zap,
  Eye, Check, ListChecks, Archive, RotateCcw, Calendar, ChevronLeft, ChevronRight, Clock, Flag, FileSpreadsheet, Activity
} from 'lucide-react';
import ThemeToggle from '../common/ThemeToggle';

export default function Admin1Dashboard() {
  const { user, logout } = useAuth();
  const { adminStats, recentViolations } = useSocket();

  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'teams', 'questions', 'rounds', 'results', 'violations', 'settings'
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Data states
  const [teams, setTeams] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [violations, setViolations] = useState([]);
  const [settings, setSettings] = useState({});
  const [lanUrls, setLanUrls] = useState({});
  const [health, setHealth] = useState(null);
  const [isTestMode, setIsTestMode] = useState(false);

  // Date-Wise Event History states
  const [eventRuns, setEventRuns] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  });
  const [selectedEventRun, setSelectedEventRun] = useState(null);
  const [selectedRunDetails, setSelectedRunDetails] = useState(null);
  const [eventRunFilter, setEventRunFilter] = useState('all'); // 'all', 'real', 'test'
  const [showRoundDetailModal, setShowRoundDetailModal] = useState(false);
  const [roundDetailData, setRoundDetailData] = useState(null);
  const [roundDetailLoading, setRoundDetailLoading] = useState(false);
  const [showNewEventModal, setShowNewEventModal] = useState(false);
  const [newEventForm, setNewEventForm] = useState({
    event_name: 'GLITCH HUNT 2026',
    event_date: '',
    is_test_run: false
  });

  // Modals & Form states
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showStageModal, setShowStageModal] = useState(false);
  const [showDeleteSafetyModal, setShowDeleteSafetyModal] = useState(false);
  const [showQuestionDeleteModal, setShowQuestionDeleteModal] = useState(false);

  const [questionFilter, setQuestionFilter] = useState('all'); // 'all', 'active', 'disabled'
  const [editingTeam, setEditingTeam] = useState(null);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editingStage, setEditingStage] = useState(null);
  const [stageToDelete, setStageToDelete] = useState(null);
  const [questionToDelete, setQuestionToDelete] = useState(null);
  const [deleteSafetyData, setDeleteSafetyData] = useState(null);
  const [generatedCreds, setGeneratedCreds] = useState(null);

  // Stage Form
  const [stageForm, setStageForm] = useState({
    title: '',
    subtitle: '',
    description: '',
    rulesText: '',
    is_enabled: 1,
    is_tie_break: 0,
    scoring_correct: 1.0,
    scoring_wrong: 0.0,
    scoring_unanswered: 0.0,
    stage_number: '',
    order_index: ''
  });

  // New Team Form
  const [teamForm, setTeamForm] = useState({
    team_name: '',
    college_name: 'RRASE College of Engineering',
    captain_name: '',
    member_count: 2,
    members: '',
    contact_number: '',
    email: '',
    department: 'ECE',
    year: 'III'
  });

  // New Question Form
  const [questionForm, setQuestionForm] = useState({
    round_id: 1,
    question_number: '',
    question_text: '',
    option_a: '',
    option_b: '',
    option_c: '',
    option_d: '',
    correct_option: 'A',
    time_limit_sec: 30,
    explanation: '',
    is_active: 1
  });

  useEffect(() => {
    loadAllData();
  }, [activeTab]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [setsRes, teamsRes, qRes, rRes] = await Promise.all([
        api.getSettings(),
        api.getTeams(),
        api.getQuestions(),
        api.getRounds()
      ]);

      if (setsRes.success) {
        setSettings(setsRes.settings || {});
        setLanUrls(setsRes.lanUrls || {});
        setIsTestMode(Boolean(setsRes.isTestingMode));
      }
      if (teamsRes.success) setTeams(teamsRes.teams || []);
      if (qRes.success) setQuestions(qRes.questions || []);
      if (rRes.success) setRounds(rRes.rounds || []);

      if (activeTab === 'results') {
        await loadEventHistory();
      } else if (activeTab === 'violations') {
        const vRes = await api.getViolations(100);
        if (vRes.success) setViolations(vRes.violations || []);
      } else if (activeTab === 'overview') {
        const hRes = await api.getHealth();
        if (hRes.success) setHealth(hRes.health);
      }
    } catch (err) {
      console.error('Error loading admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadEventHistory = async (targetDate, filterType, preferredRunId = null) => {
    try {
      const dateToQuery = targetDate || selectedDate;
      const fType = filterType || eventRunFilter;
      const params = { date: dateToQuery };
      if (fType === 'real') params.isTest = 'false';
      if (fType === 'test') params.isTest = 'true';

      const res = await api.getEventRuns(params);
      if (res.success) {
        const runs = res.eventRuns || [];
        setEventRuns(runs);

        let activeRun = null;
        if (preferredRunId) {
          activeRun = runs.find(r => r.event_run_id === preferredRunId);
        }
        if (!activeRun && runs.length > 0) {
          activeRun = runs[0];
        }

        setSelectedEventRun(activeRun);
        if (activeRun) {
          await loadRunDetails(activeRun.event_run_id);
        } else {
          setSelectedRunDetails(null);
          setLeaderboard([]);
        }
      }
    } catch (err) {
      console.error('[LOAD EVENT HISTORY ERROR]', err);
    }
  };

  const loadRunDetails = async (runId) => {
    if (!runId) return;
    try {
      const detailsRes = await api.getEventRunDetails(runId);
      if (detailsRes.success) {
        setSelectedRunDetails(detailsRes);
        setLeaderboard(detailsRes.leaderboard || []);
      }
    } catch (err) {
      console.error('[LOAD RUN DETAILS ERROR]', err);
    }
  };

  const handlePrevDate = () => {
    const parts = selectedDate.split('-');
    const curDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    curDate.setDate(curDate.getDate() - 1);
    const newDateStr = `${String(curDate.getDate()).padStart(2, '0')}-${String(curDate.getMonth() + 1).padStart(2, '0')}-${curDate.getFullYear()}`;
    setSelectedDate(newDateStr);
    loadEventHistory(newDateStr, eventRunFilter);
  };

  const handleNextDate = () => {
    const parts = selectedDate.split('-');
    const curDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    curDate.setDate(curDate.getDate() + 1);
    const newDateStr = `${String(curDate.getDate()).padStart(2, '0')}-${String(curDate.getMonth() + 1).padStart(2, '0')}-${curDate.getFullYear()}`;
    setSelectedDate(newDateStr);
    loadEventHistory(newDateStr, eventRunFilter);
  };

  const handleTodayDate = () => {
    const d = new Date();
    const todayStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    setSelectedDate(todayStr);
    loadEventHistory(todayStr, eventRunFilter);
  };

  const handleSelectRun = async (runId) => {
    const run = eventRuns.find(r => r.event_run_id === runId);
    setSelectedEventRun(run || null);
    if (runId) {
      await loadRunDetails(runId);
    }
  };

  const handleOpenRoundDetails = async (roundId) => {
    if (!selectedEventRun) return;
    setRoundDetailLoading(true);
    setShowRoundDetailModal(true);
    try {
      const res = await api.getRoundResultDetails(selectedEventRun.event_run_id, roundId);
      if (res.success) {
        setRoundDetailData(res);
      } else {
        alert(res.message || 'Failed to load round details');
        setShowRoundDetailModal(false);
      }
    } catch (err) {
      alert('Error: ' + err.message);
      setShowRoundDetailModal(false);
    } finally {
      setRoundDetailLoading(false);
    }
  };

  const handleCreateNewEventRun = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createEventRun({
        ...newEventForm,
        event_date: newEventForm.event_date || selectedDate
      });
      if (res.success) {
        setMessage(`New Event Run Created: ${res.eventRun.event_run_id}`);
        setShowNewEventModal(false);
        setSelectedDate(res.eventRun.event_date);
        await loadEventHistory(res.eventRun.event_date, eventRunFilter, res.eventRun.event_run_id);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCompleteEvent = async () => {
    if (!selectedEventRun) return;
    if (!window.confirm(`Mark Event Run ${selectedEventRun.event_run_id} as COMPLETED? This will calculate final winner and freeze event session.`)) return;
    try {
      const res = await api.completeEventRun(selectedEventRun.event_run_id);
      if (res.success) {
        setMessage(`Event Run completed! Winner: ${res.eventRun.final_winner}`);
        await loadEventHistory(selectedDate, eventRunFilter, selectedEventRun.event_run_id);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Listen for auth restored to reload data seamlessly
  useEffect(() => {
    const onAuthRestored = () => {
      loadAllData();
    };
    window.addEventListener('glitch:auth_restored', onAuthRestored);
    return () => window.removeEventListener('glitch:auth_restored', onAuthRestored);
  }, []);

  // Team Actions
  const handleSaveTeam = async (e) => {
    e.preventDefault();
    try {
      if (editingTeam) {
        await api.updateTeam(editingTeam.id, teamForm);
        setMessage('Team updated successfully');
      } else {
        const res = await api.createTeam(teamForm);
        if (res.success && res.team) {
          setGeneratedCreds(res.team);
          setMessage(`Team created! Generated Username: ${res.team.username}, Password: ${res.team.password}`);
        }
      }
      setShowTeamModal(false);
      setEditingTeam(null);
      loadAllData();
    } catch (err) {
      if (err.message && err.message.includes('expired')) {
        console.warn('[ADMIN 1] Admin session expired during team registration. Please re-authenticate in the modal.');
      } else {
        alert(err.message);
      }
    }
  };

  const handleResetCreds = async (teamId) => {
    if (!window.confirm('Reset credentials for this team?')) return;
    try {
      const res = await api.resetTeamCredentials(teamId);
      if (res.success) {
        alert(`New Password for ${res.credentials.username}: ${res.credentials.newPassword}`);
        loadAllData();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleToggleTeamStatus = async (teamId, status) => {
    try {
      await api.toggleTeamStatus(teamId, status);
      loadAllData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteTeam = async (teamId) => {
    if (!window.confirm('Are you sure you want to delete this team?')) return;
    try {
      await api.deleteTeam(teamId);
      loadAllData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Question Actions
  const handleOpenEditQuestion = (q) => {
    setEditingQuestion(q);
    setQuestionForm({
      round_id: q.round_id,
      question_number: q.question_number,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_option: q.correct_option,
      time_limit_sec: q.time_limit_sec,
      explanation: q.explanation || '',
      is_active: q.is_active !== undefined ? q.is_active : 1
    });
    setShowQuestionModal(true);
  };

  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    try {
      if (editingQuestion) {
        if (editingQuestion.answer_count > 0) {
          const res = await api.createQuestionVersion(editingQuestion.id, questionForm);
          setMessage(`NEW QUESTION VERSION (v${res.question.version}) CREATED SUCCESSFULLY. Previous version safely archived.`);
        } else {
          await api.updateQuestion(editingQuestion.id, questionForm);
          setMessage('QUESTION UPDATED SUCCESSFULLY');
        }
      } else {
        await api.createQuestion(questionForm);
        setMessage('Question added successfully');
      }
      setShowQuestionModal(false);
      setEditingQuestion(null);
      await loadAllData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleInitiateDeleteQuestion = (q) => {
    setQuestionToDelete(q);
    setShowQuestionDeleteModal(true);
  };

  const handleConfirmDeleteQuestion = async () => {
    if (!questionToDelete) return;
    try {
      const res = await api.deleteQuestion(questionToDelete.id);
      if (res.hasEventHistory || res.disabled) {
        setMessage(`${res.title}: ${res.message}`);
      } else {
        setMessage(res.message || 'Question deleted successfully');
      }
      setShowQuestionDeleteModal(false);
      setQuestionToDelete(null);
      loadAllData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleConfirmDisableQuestion = async () => {
    if (!questionToDelete) return;
    try {
      const res = await api.deleteQuestion(questionToDelete.id);
      if (res.hasEventHistory || res.disabled) {
        setMessage(`${res.title}: ${res.message}`);
      } else {
        setMessage('Question disabled to preserve event history.');
      }
      setShowQuestionDeleteModal(false);
      setQuestionToDelete(null);
      loadAllData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRestoreQuestion = async (id) => {
    try {
      const res = await api.toggleQuestionStatus(id, 1);
      setMessage(res.message || 'Question restored and enabled successfully.');
      loadAllData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Stage Management Actions
  const handleOpenAddStage = () => {
    setEditingStage(null);
    const maxStageNum = rounds.length > 0 ? Math.max(...rounds.map(r => r.stage_number || 0)) : 0;
    setStageForm({
      title: '',
      subtitle: '',
      description: '',
      rulesText: '',
      is_enabled: 1,
      is_tie_break: 0,
      scoring_correct: 1.0,
      scoring_wrong: 0.0,
      scoring_unanswered: 0.0,
      stage_number: maxStageNum + 1,
      order_index: maxStageNum + 1
    });
    setShowStageModal(true);
  };

  const handleOpenEditStage = (stage) => {
    setEditingStage(stage);
    const rulesStr = Array.isArray(stage.rules) ? stage.rules.join('\n') : (stage.rules || '');
    setStageForm({
      title: stage.title || '',
      subtitle: stage.subtitle || '',
      description: stage.description || '',
      rulesText: rulesStr,
      is_enabled: stage.is_enabled !== undefined ? stage.is_enabled : 1,
      is_tie_break: stage.is_tie_break || 0,
      scoring_correct: stage.scoring_correct !== undefined ? stage.scoring_correct : 1.0,
      scoring_wrong: stage.scoring_wrong !== undefined ? stage.scoring_wrong : 0.0,
      scoring_unanswered: stage.scoring_unanswered !== undefined ? stage.scoring_unanswered : 0.0,
      stage_number: stage.stage_number || '',
      order_index: stage.order_index || ''
    });
    setShowStageModal(true);
  };

  const handleSaveStage = async (e) => {
    e.preventDefault();
    if (!stageForm.title || !stageForm.title.trim()) {
      alert('Stage title is required');
      return;
    }

    const rulesArray = stageForm.rulesText
      ? stageForm.rulesText.split('\n').map(r => r.trim()).filter(Boolean)
      : [];

    const payload = {
      title: stageForm.title.trim(),
      subtitle: stageForm.subtitle.trim(),
      description: stageForm.description.trim(),
      rules: rulesArray,
      is_enabled: Number(stageForm.is_enabled),
      is_tie_break: Number(stageForm.is_tie_break),
      scoring_correct: Number(stageForm.scoring_correct),
      scoring_wrong: Number(stageForm.scoring_wrong),
      scoring_unanswered: Number(stageForm.scoring_unanswered)
    };
    if (stageForm.stage_number) payload.stage_number = Number(stageForm.stage_number);
    if (stageForm.order_index) payload.order_index = Number(stageForm.order_index);

    try {
      if (editingStage) {
        await api.updateRound(editingStage.id, payload);
        setMessage(`Stage "${payload.title}" updated successfully`);
      } else {
        await api.createRound(payload);
        setMessage(`New stage "${payload.title}" created successfully`);
      }
      setShowStageModal(false);
      setEditingStage(null);
      loadAllData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleToggleStageStatus = async (stage) => {
    const nextStatus = stage.is_enabled === 1 ? 0 : 1;
    try {
      await api.toggleRoundStatus(stage.id, nextStatus);
      setMessage(`Stage "${stage.title}" is now ${nextStatus ? 'enabled' : 'disabled'}`);
      loadAllData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleInitiateDeleteStage = (stage) => {
    setStageToDelete(stage);
    if ((stage.questionCount && stage.questionCount > 0) || (stage.answerCount && stage.answerCount > 0)) {
      setDeleteSafetyData({
        hasDependentData: true,
        questionCount: stage.questionCount || 0,
        answerCount: stage.answerCount || 0
      });
    } else {
      setDeleteSafetyData(null);
    }
    setShowDeleteSafetyModal(true);
  };

  const handleConfirmDeleteStage = async (force = false) => {
    if (!stageToDelete) return;
    try {
      await api.deleteRound(stageToDelete.id, force);
      setMessage(`Stage "${stageToDelete.title}" deleted.`);
      setShowDeleteSafetyModal(false);
      setStageToDelete(null);
      setDeleteSafetyData(null);
      loadAllData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDisableInstead = async () => {
    if (!stageToDelete) return;
    try {
      await api.toggleRoundStatus(stageToDelete.id, 0);
      setMessage(`Stage "${stageToDelete.title}" disabled instead of deleting. Questions & answers preserved.`);
      setShowDeleteSafetyModal(false);
      setStageToDelete(null);
      setDeleteSafetyData(null);
      loadAllData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Testing Mode Actions
  const handleToggleTestMode = async () => {
    const next = !isTestMode;
    try {
      const res = await api.toggleTestingMode(next);
      if (res.success) {
        setIsTestMode(next);
        setMessage(res.message);
        loadAllData();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleBulkTestTeams = async (count) => {
    try {
      const res = await api.bulkGenerateTestTeams(count);
      if (res.success) {
        setMessage(res.message);
        loadAllData();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleClearTestTeams = async () => {
    if (!window.confirm('Clear all test teams and test answers?')) return;
    try {
      const res = await api.clearTestTeams();
      if (res.success) {
        setMessage(res.message);
        loadAllData();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a1128] text-white flex flex-col font-sans">
      {/* 1. Master Navigation Header */}
      <header className="bg-[#0e1a38] border-b border-cyan-500/30 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Zap className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono text-cyan-400 font-bold tracking-wider">ADMIN 1</span>
              <span className="text-xs text-slate-500 font-mono">• MASTER COMMAND CENTER</span>
            </div>
            <h1 className="text-xl font-display font-bold text-white">GLITCH HUNT MASTER DASHBOARD</h1>
          </div>
        </div>

        {/* Global Controls & Test Mode Toggle */}
        <div className="flex items-center space-x-3">
          <ThemeToggle />

          <button
            onClick={handleToggleTestMode}
            className={`px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold border transition ${
              isTestMode
                ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            TESTING MODE: {isTestMode ? 'ON' : 'OFF'}
          </button>

          <a
            href="/controller"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-pink-950/60 border border-pink-500/40 text-pink-300 text-xs font-mono hover:bg-pink-900/60 transition"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>ADMIN 2 LIVE</span>
          </a>

          <a
            href="/live"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-red-950/60 border border-red-500/50 text-red-300 text-xs font-mono hover:bg-red-900/60 transition shadow-sm"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <Activity className="w-3.5 h-3.5" />
            <span>LIVE SCOREBOARD</span>
          </a>

          <a
            href="/projector"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono hover:bg-cyan-900/60 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>PROJECTOR</span>
          </a>

          <button
            onClick={logout}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Message Banner */}
      {message && (
        <div className="bg-cyan-950/80 border-b border-cyan-500/40 px-6 py-2.5 text-cyan-200 text-xs font-mono flex items-center justify-between">
          <span>⚡ {message}</span>
          <button onClick={() => setMessage('')} className="text-cyan-400 hover:text-white">✕</button>
        </div>
      )}

      {/* 2. Sub-Nav Tabs */}
      <nav className="bg-[#090f1d] border-b border-slate-800 px-6 flex space-x-2 overflow-x-auto">
        {[
          { id: 'overview', label: 'OVERVIEW & HUD', icon: Zap },
          { id: 'teams', label: 'TEAMS & CREDENTIALS', icon: Users },
          { id: 'questions', label: 'QUESTION BANK', icon: HelpCircle },
          { id: 'rounds', label: 'STAGES & SCORING', icon: Layers },
          { id: 'results', label: 'RESULTS & EXPORT', icon: Award },
          { id: 'violations', label: 'ANTI-CHEAT LOGS', icon: ShieldAlert },
          { id: 'settings', label: 'SETTINGS & LAN IP', icon: Settings }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-display text-sm font-semibold tracking-wider whitespace-nowrap transition ${
                isActive
                  ? 'border-cyan-400 text-cyan-400 bg-cyan-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 3. Tab Contents */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* TAB 1: OVERVIEW & HUD */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Live Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-[#0d1527] border border-slate-800">
                <div className="text-xs font-mono text-slate-400 uppercase">TOTAL TEAMS</div>
                <div className="text-3xl font-display font-bold text-white mt-1">
                  {teams.length}
                </div>
                <div className="text-[11px] font-mono text-cyan-400 mt-1">
                  {teams.filter(t => t.status === 'active').length} ACTIVE
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#0d1527] border border-slate-800">
                <div className="text-xs font-mono text-slate-400 uppercase">CONNECTED SOCKETS</div>
                <div className="text-3xl font-display font-bold text-emerald-400 mt-1">
                  {adminStats?.connectedCount || 0}
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-1">
                  {adminStats?.disconnectedCount || 0} DISCONNECTED
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#0d1527] border border-slate-800">
                <div className="text-xs font-mono text-slate-400 uppercase">ACTIVE STAGE</div>
                <div className="text-xl font-display font-bold text-cyan-300 mt-2 truncate">
                  {adminStats?.currentState || 'IDLE'}
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-1">
                  STAGE #{adminStats?.currentStageId || 1}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#0d1527] border border-slate-800">
                <div className="text-xs font-mono text-slate-400 uppercase">TOTAL QUESTIONS</div>
                <div className="text-3xl font-display font-bold text-white mt-1">
                  {questions.length}
                </div>
                <div className="text-[11px] font-mono text-purple-400 mt-1">
                  ACROSS 8 STAGES
                </div>
              </div>
            </div>

            {/* PROMINENT LIVE SCOREBOARD BUTTON / CARD */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-[#0d1527] via-[#16102b] to-[#0d1527] border-2 border-red-500/50 shadow-xl shadow-red-950/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
              <div className="space-y-1.5">
                <div className="flex items-center space-x-3">
                  <span className="relative flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
                  </span>
                  <h2 className="text-2xl font-display font-black text-white tracking-wider flex items-center space-x-2">
                    <span>🔴 LIVE SCOREBOARD</span>
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                    REAL-TIME ARENA MONITOR
                  </span>
                </div>
                <p className="text-sm font-mono text-slate-300">
                  Real-time event monitoring &amp; rankings
                </p>
                <div className="text-xs font-mono text-red-400/90 pt-0.5">
                  Direct LAN URL: <span className="text-red-300 font-bold select-all">{lanUrls.live || `${window.location.origin}/live`}</span>
                </div>
              </div>

              <div className="flex items-center space-x-3 w-full md:w-auto">
                <a
                  href="/live"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 md:flex-initial inline-flex items-center justify-center space-x-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-500 hover:from-red-500 hover:to-rose-500 text-white font-display font-bold text-sm tracking-wider shadow-lg shadow-red-600/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  <span>OPEN LIVE MONITOR</span>
                  <span className="text-lg">→</span>
                </a>
              </div>
            </div>

            {/* LOCAL LAN / WI-FI PARTICIPATION LINKS (5 CARDS) */}
            <div className="p-6 rounded-2xl bg-[#0d1527] border border-cyan-500/30">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="text-sm font-mono text-cyan-400 font-bold uppercase tracking-wider">
                  LOCAL LAN / WI-FI PARTICIPATION LINKS
                </h3>
                <span className="text-[11px] font-mono text-slate-400">
                  Current LAN IP: <span className="text-cyan-300 font-bold">{lanUrls.ip || 'localhost'}</span>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* 1. PARTICIPANT MOBILE URL */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono text-slate-400">PARTICIPANT MOBILE URL</div>
                    <div className="text-sm font-mono text-cyan-300 font-bold mt-1 select-all truncate" title={lanUrls.user}>{lanUrls.user}</div>
                  </div>
                  <a href={lanUrls.user || '/user'} target="_blank" rel="noopener noreferrer" className="mt-2 text-[11px] font-mono text-cyan-400 hover:underline inline-flex items-center space-x-1">
                    <span>Open Mobile</span>
                    <span>↗</span>
                  </a>
                </div>

                {/* 2. PROJECTOR SCREEN URL */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono text-slate-400">PROJECTOR SCREEN URL</div>
                    <div className="text-sm font-mono text-cyan-300 font-bold mt-1 select-all truncate" title={lanUrls.projector}>{lanUrls.projector}</div>
                  </div>
                  <a href={lanUrls.projector || '/projector'} target="_blank" rel="noopener noreferrer" className="mt-2 text-[11px] font-mono text-cyan-400 hover:underline inline-flex items-center space-x-1">
                    <span>Open Projector</span>
                    <span>↗</span>
                  </a>
                </div>

                {/* 3. ADMIN 1 (MASTER) */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono text-slate-400">ADMIN 1 (MASTER)</div>
                    <div className="text-sm font-mono text-cyan-300 font-bold mt-1 select-all truncate" title={lanUrls.admin1}>{lanUrls.admin1}</div>
                  </div>
                  <a href={lanUrls.admin1 || '/admin'} target="_blank" rel="noopener noreferrer" className="mt-2 text-[11px] font-mono text-cyan-400 hover:underline inline-flex items-center space-x-1">
                    <span>Open Admin 1</span>
                    <span>↗</span>
                  </a>
                </div>

                {/* 4. ADMIN 2 (CONTROLLER) */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono text-slate-400">ADMIN 2 (CONTROLLER)</div>
                    <div className="text-sm font-mono text-cyan-300 font-bold mt-1 select-all truncate" title={lanUrls.admin2}>{lanUrls.admin2}</div>
                  </div>
                  <a href={lanUrls.admin2 || '/controller'} target="_blank" rel="noopener noreferrer" className="mt-2 text-[11px] font-mono text-pink-400 hover:underline inline-flex items-center space-x-1">
                    <span>Open Controller</span>
                    <span>↗</span>
                  </a>
                </div>

                {/* 5. LIVE SCOREBOARD */}
                <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-500/40 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono text-red-300 font-bold flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span>LIVE SCOREBOARD</span>
                    </div>
                    <div className="text-sm font-mono text-red-300 font-bold mt-1 select-all truncate" title={lanUrls.live || `${window.location.origin}/live`}>
                      {lanUrls.live || `${window.location.origin}/live`}
                    </div>
                  </div>
                  <a href={lanUrls.live || '/live'} target="_blank" rel="noopener noreferrer" className="mt-2 text-[11px] font-mono text-red-400 hover:underline inline-flex items-center space-x-1">
                    <span>Open Live Scoreboard</span>
                    <span>↗</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TEAMS & CREDENTIALS */}
        {activeTab === 'teams' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-display font-bold text-white">PARTICIPATING TEAMS</h2>
                <p className="text-xs font-mono text-slate-400">Manage registered teams, view login credentials, or add on-the-spot teams.</p>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleBulkTestTeams(10)}
                  className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-cyan-400 text-xs font-mono text-slate-300 transition"
                >
                  + Generate 10 Test Teams
                </button>

                <button
                  onClick={() => handleBulkTestTeams(60)}
                  className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-cyan-400 text-xs font-mono text-slate-300 transition"
                >
                  + Generate 60 Test Teams
                </button>

                <button
                  onClick={handleClearTestTeams}
                  className="px-3 py-2 rounded-xl bg-red-950/60 border border-red-500/40 text-xs font-mono text-red-300 hover:bg-red-900 transition"
                >
                  Clear Test Teams
                </button>

                <button
                  onClick={() => {
                    setEditingTeam(null);
                    setShowTeamModal(true);
                  }}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-cyan-500 text-black font-display font-bold text-sm hover:bg-cyan-400 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>REGISTER NEW TEAM</span>
                </button>
              </div>
            </div>

            {/* Teams Table */}
            <div className="bg-[#0d1527] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#080d19] border-b border-slate-800 text-xs font-mono text-cyan-400 uppercase">
                    <tr>
                      <th className="p-4">Team Name</th>
                      <th className="p-4">College</th>
                      <th className="p-4">Captain / Contact</th>
                      <th className="p-4">Login Username</th>
                      <th className="p-4">Password Hint</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Score</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {teams.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-800/30">
                        <td className="p-4 font-display font-bold text-white">
                          <div className="flex items-center space-x-2">
                            <span className={`w-2 h-2 rounded-full ${t.isConnected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                            <span>{t.team_name}</span>
                            {t.is_test_team === 1 && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-500/40 font-mono">
                                TEST
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-slate-300 text-xs">{t.college_name}</td>
                        <td className="p-4 text-xs font-mono">
                          <div>{t.captain_name}</div>
                          <div className="text-slate-500">{t.contact_number || 'No phone'}</div>
                        </td>
                        <td className="p-4 font-mono text-xs text-cyan-300 select-all">{t.username}</td>
                        <td className="p-4 font-mono text-xs text-amber-300 select-all">{t.password_plain_hint || '••••••'}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-bold ${
                            t.status === 'active' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40' :
                            t.status === 'disqualified' ? 'bg-red-950 text-red-400 border border-red-500/40' :
                            'bg-slate-800 text-slate-400'
                          }`}>
                            {t.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-sm font-bold text-white">{t.totalScore || 0}</td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => handleResetCreds(t.id)}
                              className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg hover:bg-slate-800"
                              title="Reset Password"
                            >
                              <Key className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleToggleTeamStatus(t.id, t.status === 'disqualified' ? 'active' : 'disqualified')}
                              className={`p-1.5 rounded-lg hover:bg-slate-800 ${t.status === 'disqualified' ? 'text-emerald-400' : 'text-red-400'}`}
                              title={t.status === 'disqualified' ? 'Reinstate Team' : 'Disqualify Team'}
                            >
                              <ShieldAlert className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteTeam(t.id)}
                              className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800"
                              title="Delete Team"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: QUESTION BANK */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-display font-bold text-white">QUESTION MANAGEMENT</h2>
                <p className="text-xs font-mono text-slate-400">Unlimited questions stored dynamically in the database.</p>
              </div>

              <button
                onClick={() => {
                  setEditingQuestion(null);
                  setQuestionForm({
                    round_id: rounds[0]?.id || 1,
                    question_number: '',
                    question_text: '',
                    option_a: '',
                    option_b: '',
                    option_c: '',
                    option_d: '',
                    correct_option: 'A',
                    time_limit_sec: 30,
                    explanation: '',
                    is_active: 1
                  });
                  setShowQuestionModal(true);
                }}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-cyan-500 text-black font-display font-bold text-sm hover:bg-cyan-400 transition"
              >
                <Plus className="w-4 h-4" />
                <span>ADD QUESTION</span>
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
              <span className="text-xs font-mono text-slate-400 mr-2">VIEW:</span>
              <button
                onClick={() => setQuestionFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center space-x-1.5 ${
                  questionFilter === 'all'
                    ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20'
                    : 'bg-slate-900 border border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                <span>ALL</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20">{questions.length}</span>
              </button>
              <button
                onClick={() => setQuestionFilter('active')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center space-x-1.5 ${
                  questionFilter === 'active'
                    ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                    : 'bg-slate-900 border border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                <span>ACTIVE</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20">
                  {questions.filter(q => q.is_active !== 0).length}
                </span>
              </button>
              <button
                onClick={() => setQuestionFilter('disabled')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition flex items-center space-x-1.5 ${
                  questionFilter === 'disabled'
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                    : 'bg-slate-900 border border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                <span>DISABLED / ARCHIVED</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20">
                  {questions.filter(q => q.is_active === 0).length}
                </span>
              </button>
            </div>

            {/* Questions List */}
            <div className="space-y-3">
              {questions
                .filter(q => {
                  if (questionFilter === 'active') return q.is_active !== 0;
                  if (questionFilter === 'disabled') return q.is_active === 0;
                  return true;
                })
                .map((q) => {
                  const hasHistory = (q.answer_count && q.answer_count > 0);
                  const isDisabled = (q.is_active === 0);

                  return (
                    <div 
                      key={q.id} 
                      className={`p-5 rounded-2xl ${
                        isDisabled ? 'bg-[#0d1527]/50 border-amber-900/40 opacity-80' : 'bg-[#0d1527] border-slate-800'
                      } border hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-4`}
                    >
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="px-2.5 py-0.5 rounded bg-blue-950 border border-blue-500/40 text-blue-400 text-xs font-mono font-bold">
                            {q.round_title || `Stage ${q.round_id}`}
                          </span>
                          <span className="text-xs font-mono text-slate-500">Q #{q.question_number}</span>
                          <span className="text-xs font-mono text-amber-400">⏳ {q.time_limit_sec}s</span>
                          <span className="text-xs font-mono text-emerald-400 font-bold">CORRECT: {q.correct_option}</span>

                          {isDisabled && (
                            <span className="px-2.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/60 text-amber-400 text-xs font-mono font-bold">
                              DISABLED / ARCHIVED
                            </span>
                          )}

                          {hasHistory && (
                            <span className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono">
                              📊 {q.answer_count} ANSWERS RECORDED
                            </span>
                          )}
                        </div>

                        <h4 className={`text-base font-semibold ${isDisabled ? 'text-slate-400 line-through' : 'text-white'} font-sans`}>
                          {q.question_text}
                        </h4>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs font-mono">
                          <div className={`p-1.5 rounded border ${q.correct_option === 'A' ? 'border-emerald-500 text-emerald-300 bg-emerald-950/30' : 'border-slate-800 text-slate-400'}`}>A: {q.option_a}</div>
                          <div className={`p-1.5 rounded border ${q.correct_option === 'B' ? 'border-emerald-500 text-emerald-300 bg-emerald-950/30' : 'border-slate-800 text-slate-400'}`}>B: {q.option_b}</div>
                          <div className={`p-1.5 rounded border ${q.correct_option === 'C' ? 'border-emerald-500 text-emerald-300 bg-emerald-950/30' : 'border-slate-800 text-slate-400'}`}>C: {q.option_c}</div>
                          <div className={`p-1.5 rounded border ${q.correct_option === 'D' ? 'border-emerald-500 text-emerald-300 bg-emerald-950/30' : 'border-slate-800 text-slate-400'}`}>D: {q.option_d}</div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          onClick={() => handleOpenEditQuestion(q)}
                          className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-cyan-950/60 border border-cyan-500/50 text-cyan-300 text-xs font-mono font-bold hover:bg-cyan-900 transition"
                          title="Edit Question"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>EDIT</span>
                        </button>

                        {isDisabled ? (
                          <button
                            onClick={() => handleRestoreQuestion(q.id)}
                            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-emerald-950 border border-emerald-500/60 text-emerald-300 text-xs font-mono font-bold hover:bg-emerald-900 transition"
                            title="Restore / Enable Question"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>RESTORE / ENABLE</span>
                          </button>
                        ) : hasHistory ? (
                          <button
                            onClick={() => handleInitiateDeleteQuestion(q)}
                            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-amber-950/60 border border-amber-500/50 text-amber-300 text-xs font-mono font-bold hover:bg-amber-900 transition"
                            title="Question has history: Disable / Archive"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            <span>DISABLE / ARCHIVE</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleInitiateDeleteQuestion(q)}
                            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs font-mono font-bold hover:bg-rose-900 transition"
                            title="Delete Unused Question"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>DELETE</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

              {questions.filter(q => {
                if (questionFilter === 'active') return q.is_active !== 0;
                if (questionFilter === 'disabled') return q.is_active === 0;
                return true;
              }).length === 0 && (
                <div className="p-8 text-center rounded-2xl bg-[#0d1527] border border-slate-800 text-slate-400 font-mono text-xs">
                  No questions match the selected filter.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: STAGES & SCORING */}
        {activeTab === 'rounds' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-display font-bold text-white flex items-center space-x-2">
                  <span>STAGE MANAGEMENT</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-mono">
                    {rounds.length} STAGES CONFIGURED
                  </span>
                </h2>
                <p className="text-xs font-mono text-slate-400 mt-1">
                  Configure stage titles, short descriptions, detailed descriptions, operational rules, status, and scoring models.
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={loadAllData}
                  className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400 text-xs font-mono text-slate-300 transition"
                  title="Reload stages from database"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>REFRESH</span>
                </button>

                <button
                  onClick={handleOpenAddStage}
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-cyan-500 text-black font-display font-bold text-sm tracking-wide shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>ADD NEW STAGE</span>
                </button>
              </div>
            </div>

            {/* Stages Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {rounds.map((r) => {
                const isEnabled = r.is_enabled !== 0;
                const rulesList = Array.isArray(r.rules) ? r.rules : [];

                return (
                  <div
                    key={r.id}
                    className={`p-6 rounded-2xl bg-[#0d1527] border transition-all flex flex-col justify-between shadow-xl ${
                      isEnabled ? 'border-slate-800 hover:border-cyan-500/40' : 'border-rose-950/40 opacity-75'
                    }`}
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs font-mono px-2.5 py-1 rounded font-bold ${
                            r.is_tie_break
                              ? 'bg-amber-950 text-amber-400 border border-amber-500/40'
                              : 'bg-blue-950 text-blue-400 border border-blue-500/40'
                          }`}>
                            STAGE {r.stage_number} {r.is_tie_break ? '• TIE BREAK' : '• MAIN ROUND'}
                          </span>

                          <button
                            onClick={() => handleToggleStageStatus(r)}
                            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold border transition ${
                              isEnabled
                                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900'
                                : 'bg-rose-950/80 border-rose-500/50 text-rose-300 hover:bg-rose-900'
                            }`}
                            title="Click to toggle stage status"
                          >
                            {isEnabled ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            <span>{isEnabled ? 'ENABLED' : 'DISABLED'}</span>
                          </button>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/50 border border-slate-800 text-slate-400">
                            {r.questionCount || 0} Questions
                          </span>
                        </div>
                      </div>

                      {/* Stage Name & Subtitle */}
                      <h3 className="text-xl font-display font-bold text-white tracking-wide">
                        {r.title}
                      </h3>
                      <p className="text-xs font-mono text-cyan-400 mt-1">
                        {r.subtitle || 'No short description provided'}
                      </p>

                      {/* Detailed Description */}
                      <div className="mt-4 p-3.5 rounded-xl bg-black/40 border border-slate-800/80 text-xs text-slate-300 font-sans leading-relaxed">
                        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1">
                          DETAILED DESCRIPTION
                        </span>
                        {r.description || 'No detailed description configured.'}
                      </div>

                      {/* Rules List */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-mono text-amber-300 font-bold uppercase tracking-wider flex items-center space-x-1.5">
                            <Layers className="w-3.5 h-3.5 text-amber-400" />
                            <span>STAGE RULES & PROTOCOLS ({rulesList.length})</span>
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">LIVE SYNCED</span>
                        </div>

                        {rulesList.length > 0 ? (
                          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                            {rulesList.map((rule, idx) => (
                              <div key={idx} className="flex items-start space-x-2.5 p-2.5 rounded-xl bg-[#080d19] border border-slate-800/80 text-xs">
                                <span className="w-5 h-5 rounded-md bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-mono font-bold text-[11px] flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>
                                <span className="text-slate-200 font-sans leading-relaxed flex-1">
                                  {rule}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 rounded-xl bg-[#080d19] border border-dashed border-slate-800 text-center text-xs font-mono text-slate-500">
                            No rules configured for this stage. Click Edit to add rules.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Bar: Scoring & Actions */}
                    <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center space-x-3 text-xs font-mono">
                        <span className="text-emerald-400 font-bold">+{r.scoring_correct} CORRECT</span>
                        <span className="text-rose-400">{r.scoring_wrong} WRONG</span>
                        <span className="text-slate-500">{r.scoring_unanswered} UNANSWERED</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleToggleStageStatus(r)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-mono border transition ${
                            isEnabled
                              ? 'border-slate-700 hover:border-amber-400 text-slate-300 hover:text-amber-300'
                              : 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-950/50'
                          }`}
                        >
                          {isEnabled ? 'DISABLE' : 'ENABLE'}
                        </button>

                        <button
                          onClick={() => handleOpenEditStage(r)}
                          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/70 border border-cyan-500/50 hover:bg-cyan-900 text-cyan-300 text-xs font-mono transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>EDIT</span>
                        </button>

                        <button
                          onClick={() => handleInitiateDeleteStage(r)}
                          className="p-1.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition"
                          title="Delete / Disable Stage"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 5: RESULTS & EXPORT - DATE-WISE EVENT HISTORY */}
        {activeTab === 'results' && (
          <div className="space-y-6">
            {/* Header & Date Navigation */}
            <div className="bg-[#0d1527] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-display font-bold text-white flex items-center space-x-2">
                    <Calendar className="w-5 h-5 text-cyan-400" />
                    <span>EVENT HISTORY & RESULTS ARCHIVE</span>
                  </h2>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    Browse historical event runs date-wise with isolated team scores and round breakdowns.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setNewEventForm({
                        event_name: `GLITCH HUNT - Session ${eventRuns.length + 1}`,
                        event_date: selectedDate,
                        is_test_run: false
                      });
                      setShowNewEventModal(true);
                    }}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 text-black font-display font-bold text-xs hover:bg-cyan-400 shadow-md shadow-cyan-500/20 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>NEW EVENT RUN</span>
                  </button>

                  {selectedEventRun && (
                    <a
                      href={api.getEventExportUrl(selectedEventRun.event_run_id)}
                      className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 text-black font-display font-bold text-xs hover:bg-emerald-400 shadow-md shadow-emerald-500/20 transition"
                    >
                      <Download className="w-4 h-4" />
                      <span>EXPORT EVENT CSV</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Date Control Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800/80">
                {/* Date Navigator */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handlePrevDate}
                    className="p-2 rounded-xl bg-[#080d19] border border-slate-700 hover:border-cyan-400 text-slate-300 hover:text-white transition"
                    title="Previous Date"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-[#080d19] border border-cyan-500/40">
                    <Calendar className="w-4 h-4 text-cyan-400" />
                    <span className="font-mono font-bold text-sm text-cyan-200">{selectedDate}</span>
                  </div>

                  <button
                    onClick={handleNextDate}
                    className="p-2 rounded-xl bg-[#080d19] border border-slate-700 hover:border-cyan-400 text-slate-300 hover:text-white transition"
                    title="Next Date"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleTodayDate}
                    className="px-3 py-1.5 rounded-xl bg-cyan-950 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-900 font-mono text-xs font-bold transition"
                  >
                    TODAY
                  </button>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center space-x-1.5 bg-[#080d19] p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => {
                      setEventRunFilter('all');
                      loadEventHistory(selectedDate, 'all');
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-mono transition ${
                      eventRunFilter === 'all'
                        ? 'bg-cyan-500 text-black font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ALL ({eventRuns.length})
                  </button>
                  <button
                    onClick={() => {
                      setEventRunFilter('real');
                      loadEventHistory(selectedDate, 'real');
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-mono transition ${
                      eventRunFilter === 'real'
                        ? 'bg-emerald-500 text-black font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    REAL EVENTS
                  </button>
                  <button
                    onClick={() => {
                      setEventRunFilter('test');
                      loadEventHistory(selectedDate, 'test');
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-mono transition ${
                      eventRunFilter === 'test'
                        ? 'bg-amber-500 text-black font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    TEST RUNS
                  </button>
                </div>
              </div>

              {/* Event Runs for Selected Date Pills */}
              {eventRuns.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60">
                  <span className="text-xs font-mono text-slate-400">SESSIONS ON {selectedDate}:</span>
                  {eventRuns.map((r) => {
                    const isSelected = selectedEventRun?.event_run_id === r.event_run_id;
                    const isCompleted = r.status === 'completed';
                    const isTest = Boolean(r.is_test_run);

                    return (
                      <button
                        key={r.event_run_id}
                        onClick={() => handleSelectRun(r.event_run_id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono border transition flex items-center space-x-2 ${
                          isSelected
                            ? 'bg-cyan-950 border-cyan-400 text-cyan-200 font-bold shadow-md shadow-cyan-500/20'
                            : 'bg-[#080d19] border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${
                          isCompleted ? 'bg-purple-400' : 'bg-emerald-400 animate-pulse'
                        }`} />
                        <span>{r.event_run_id}</span>
                        {r.event_name && <span className="opacity-70">({r.event_name})</span>}
                        {isTest && (
                          <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                            TEST
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* If No Event Runs on Selected Date */}
            {eventRuns.length === 0 && (
              <div className="p-12 text-center bg-[#0d1527] border border-slate-800 rounded-2xl space-y-3">
                <Calendar className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-lg font-display font-bold text-white">
                  NO EVENT RECORDED FOR {selectedDate}
                </h3>
                <p className="text-xs font-mono text-slate-400 max-w-md mx-auto">
                  There are no live event sessions or test runs registered on this date. You can initialize a new session to record answers.
                </p>
                <button
                  onClick={() => {
                    setNewEventForm({
                      event_name: `GLITCH HUNT - ${selectedDate}`,
                      event_date: selectedDate,
                      is_test_run: false
                    });
                    setShowNewEventModal(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-cyan-500 text-black font-display font-bold text-xs hover:bg-cyan-400 transition"
                >
                  CREATE EVENT RUN FOR {selectedDate}
                </button>
              </div>
            )}

            {/* Event Run Details */}
            {selectedEventRun && selectedRunDetails && (
              <div className="space-y-6">
                {/* 1. Event Summary Banner */}
                <div className="bg-[#0d1527] border border-cyan-500/40 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold">
                          {selectedEventRun.event_run_id}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-lg font-mono text-xs font-bold uppercase ${
                          selectedEventRun.status === 'completed'
                            ? 'bg-purple-950 text-purple-300 border border-purple-500/40'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                        }`}>
                          {selectedEventRun.status || 'SCHEDULED'}
                        </span>
                        {selectedEventRun.is_test_run ? (
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-950 text-amber-400 border border-amber-500/40 font-mono text-xs font-bold">
                            TEST RUN
                          </span>
                        ) : null}
                      </div>

                      <h3 className="text-2xl font-display font-bold text-white mt-2">
                        {selectedEventRun.event_name || 'GLITCH HUNT LIVE EVENT'}
                      </h3>
                      <p className="text-xs font-mono text-slate-400 mt-1">
                        Date: {selectedEventRun.event_date} • Created: {new Date(selectedEventRun.created_at).toLocaleTimeString()}
                      </p>
                    </div>

                    <div className="flex items-center space-x-3">
                      {selectedEventRun.status !== 'completed' && (
                        <button
                          onClick={handleCompleteEvent}
                          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-display font-bold text-xs shadow-md shadow-purple-600/20 transition"
                        >
                          COMPLETE EVENT RUN
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Summary Metric Badges */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-800/80 font-mono text-center">
                    <div className="p-3 rounded-xl bg-[#080d19] border border-slate-800">
                      <div className="text-xs text-slate-400 uppercase">TOTAL TEAMS</div>
                      <div className="text-xl font-bold text-cyan-300 mt-1">
                        {selectedRunDetails.summary?.totalTeams || 0}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#080d19] border border-slate-800">
                      <div className="text-xs text-slate-400 uppercase">ROUNDS CONDUCTED</div>
                      <div className="text-xl font-bold text-cyan-300 mt-1">
                        {selectedRunDetails.summary?.roundsConducted || 0} / 8
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#080d19] border border-slate-800">
                      <div className="text-xs text-slate-400 uppercase">FINAL WINNER</div>
                      <div className="text-sm font-display font-bold text-amber-300 mt-1 truncate">
                        {selectedRunDetails.summary?.finalWinner || 'In Progress...'}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#080d19] border border-slate-800">
                      <div className="text-xs text-slate-400 uppercase">WINNER SCORE</div>
                      <div className="text-xl font-bold text-emerald-300 mt-1">
                        {selectedRunDetails.summary?.finalScore !== null && selectedRunDetails.summary?.finalScore !== undefined ? `${selectedRunDetails.summary.finalScore} PTS` : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Round-by-Round History */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-display font-bold text-white flex items-center space-x-2">
                        <Layers className="w-5 h-5 text-cyan-400" />
                        <span>ROUND-BY-ROUND RESULTS BREAKDOWN</span>
                      </h4>
                      <p className="text-xs font-mono text-slate-400">
                        View winners, runners-up, and tied groups for each conducted stage.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedRunDetails.roundHistory && selectedRunDetails.roundHistory.map((round) => (
                      <div
                        key={round.roundId}
                        className="bg-[#0d1527] border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg transition flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="px-2.5 py-0.5 rounded-lg bg-blue-950 border border-blue-500/40 text-blue-300 font-mono text-xs font-bold">
                              STAGE {round.stageNumber}
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                              {round.questionCount} Questions • {round.totalAnswers} Answers
                            </span>
                          </div>

                          <h5 className="text-lg font-display font-bold text-white">
                            {round.roundTitle}
                          </h5>

                          {/* Winner & Runner Up */}
                          <div className="mt-4 space-y-2 font-mono text-xs">
                            <div className="p-2.5 rounded-xl bg-[#080d19] border border-amber-500/30 flex items-center justify-between">
                              <span className="text-amber-400 font-bold flex items-center space-x-1.5">
                                <Award className="w-4 h-4" />
                                <span>WINNER:</span>
                              </span>
                              <span className="text-white font-bold truncate max-w-[200px]">
                                {round.winner ? `${round.winner.teamName} (${round.winner.score} pts)` : 'No answers'}
                              </span>
                            </div>

                            {round.runnerUp && (
                              <div className="p-2.5 rounded-xl bg-[#080d19] border border-slate-700 flex items-center justify-between">
                                <span className="text-slate-400 flex items-center space-x-1.5">
                                  <span>RUNNER-UP:</span>
                                </span>
                                <span className="text-slate-200 truncate max-w-[200px]">
                                  {round.runnerUp.teamName} ({round.runnerUp.score} pts)
                                </span>
                              </div>
                            )}

                            {round.hasTies && (
                              <div className="p-2 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-300 text-[11px] text-center">
                                ⚠ {round.tiedCount} teams tied in this round
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                          <button
                            onClick={() => handleOpenRoundDetails(round.roundId)}
                            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-cyan-950 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-900 font-mono text-xs transition font-bold"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>VIEW ROUND RESULT</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {(!selectedRunDetails.roundHistory || selectedRunDetails.roundHistory.length === 0) && (
                    <div className="p-8 text-center bg-[#0d1527] border border-slate-800 rounded-2xl text-slate-500 font-mono text-xs">
                      No rounds have been conducted yet in this event run.
                    </div>
                  )}
                </div>

                {/* 3. Final Event Leaderboard */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-display font-bold text-white flex items-center space-x-2">
                        <Award className="w-5 h-5 text-amber-400" />
                        <span>FINAL EVENT LEADERBOARD ({selectedEventRun.event_run_id})</span>
                      </h4>
                      <p className="text-xs font-mono text-slate-400">
                        Authoritative rankings for this event run only. Does not mix with test runs or other dates.
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#0d1527] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#080d19] border-b border-slate-800 text-xs font-mono text-cyan-400 uppercase">
                        <tr>
                          <th className="p-4">Rank</th>
                          <th className="p-4">Team Name</th>
                          <th className="p-4">College</th>
                          <th className="p-4">Score</th>
                          <th className="p-4">Correct</th>
                          <th className="p-4">Avg Speed</th>
                          <th className="p-4">Tie Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {leaderboard.map((row) => (
                          <tr key={row.teamId} className="hover:bg-slate-800/30">
                            <td className="p-4 font-mono font-bold text-cyan-400 text-base">#{row.rank}</td>
                            <td className="p-4 font-display font-bold text-white">{row.teamName}</td>
                            <td className="p-4 text-xs text-slate-300">{row.collegeName}</td>
                            <td className="p-4 font-mono font-bold text-white text-base">{row.score}</td>
                            <td className="p-4 font-mono text-xs text-emerald-400">{row.correctCount} / {row.answersCount}</td>
                            <td className="p-4 font-mono text-xs text-slate-400">{row.avgSpeedMs}ms</td>
                            <td className="p-4">
                              {row.isTied ? (
                                <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-500/40 text-xs font-mono font-bold">
                                  TIED
                                </span>
                              ) : (
                                <span className="text-slate-600 text-xs font-mono">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {leaderboard.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-500 font-mono text-xs">
                              No team scores recorded yet in this event run.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: ANTI-CHEAT LOGS */}
        {activeTab === 'violations' && (
          <div className="space-y-6">
            <h2 className="text-xl font-display font-bold text-white">ANTI-CHEAT INCIDENT LOGS</h2>
            <div className="space-y-2.5">
              {violations.map((v) => (
                <div key={v.id} className="p-4 rounded-xl bg-[#0d1527] border border-red-500/30 flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-500/40 font-mono text-xs font-bold">
                        {v.violation_type}
                      </span>
                      <span className="text-sm font-display font-bold text-white">{v.team_name}</span>
                      <span className="text-xs text-slate-400">({v.college_name})</span>
                    </div>
                    <p className="text-xs font-mono text-slate-300 mt-1">{v.details}</p>
                  </div>
                  <div className="text-xs font-mono text-slate-500">
                    {new Date(v.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              {violations.length === 0 && (
                <div className="p-12 text-center text-slate-500 font-mono text-sm">
                  ✓ No security violations recorded yet.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 7: SETTINGS & LAN IP */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-2xl">
            <h2 className="text-xl font-display font-bold text-white">EVENT CONFIGURATION</h2>
            <div className="p-6 rounded-2xl bg-[#0d1527] border border-slate-800 space-y-4">
              <div>
                <label className="block text-xs font-mono text-cyan-300 uppercase mb-1">Event Name</label>
                <input
                  type="text"
                  value={settings.event_name || ''}
                  onChange={(e) => setSettings({ ...settings, event_name: e.target.value })}
                  className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-cyan-300 uppercase mb-1">Department</label>
                <input
                  type="text"
                  value={settings.department || ''}
                  onChange={(e) => setSettings({ ...settings, department: e.target.value })}
                  className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-cyan-300 uppercase mb-1">College</label>
                <input
                  type="text"
                  value={settings.college || ''}
                  onChange={(e) => setSettings({ ...settings, college: e.target.value })}
                  className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-cyan-300 uppercase mb-1">Anti-Cheat Enforcement Policy</label>
                <select
                  value={settings.anti_cheat_policy || 'WARNING'}
                  onChange={(e) => setSettings({ ...settings, anti_cheat_policy: e.target.value })}
                  className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white font-mono text-sm"
                >
                  <option value="WARNING">WARNING ONLY (Log to Admin)</option>
                  <option value="AUTO_DISQUALIFY">AUTO-DISQUALIFY AFTER THRESHOLD</option>
                </select>
              </div>

              {/* STAGE / ROUND RESULT SCREEN DURATION SETTINGS */}
              <div className="pt-4 border-t border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-sm font-display font-bold text-white flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-cyan-400" />
                      <span>STAGE / ROUND RESULT DISPLAY SETTINGS</span>
                    </h3>
                    <p className="text-[11px] font-mono text-slate-400">
                      Configure projector countdown timer (seconds) per stage (Round 1 to Tie Break 6). Range: 3s – 300s.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const updated = { ...settings };
                      for (let i = 1; i <= 8; i++) {
                        updated[`result_duration_stage_${i}`] = '10';
                      }
                      setSettings(updated);
                      setMessage('Result timers reset to default 10s. Click SAVE to apply.');
                    }}
                    className="px-2.5 py-1 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white font-mono text-xs transition"
                  >
                    RESET DEFAULTS (10s)
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {[
                    { id: 1, name: 'Round 1 (MCQ)' },
                    { id: 2, name: 'Round 2 (Bug Hunt)' },
                    { id: 3, name: 'Tie Break 1' },
                    { id: 4, name: 'Tie Break 2' },
                    { id: 5, name: 'Tie Break 3' },
                    { id: 6, name: 'Tie Break 4' },
                    { id: 7, name: 'Tie Break 5' },
                    { id: 8, name: 'Tie Break 6' }
                  ].map((stg) => {
                    const key = `result_duration_stage_${stg.id}`;
                    const val = settings[key] !== undefined ? settings[key] : '10';
                    return (
                      <div key={stg.id} className="p-2.5 rounded-xl bg-[#080d19] border border-slate-800">
                        <label className="text-[11px] font-mono text-cyan-300 block truncate mb-1">
                          {stg.name}
                        </label>
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="number"
                            min={3}
                            max={300}
                            value={val}
                            onChange={(e) => {
                              setSettings({
                                ...settings,
                                [key]: e.target.value
                              });
                            }}
                            className="w-full p-1.5 bg-black border border-slate-700 rounded-lg text-white font-mono text-xs text-center focus:border-cyan-400"
                          />
                          <span className="text-[10px] font-mono text-slate-500">sec</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={async () => {
                  await api.updateSettings(settings);
                  setMessage('Settings saved successfully');
                }}
                className="w-full py-3 rounded-xl bg-cyan-500 text-black font-display font-bold hover:bg-cyan-400 transition"
              >
                SAVE CONFIGURATION
              </button>
            </div>

            {/* LOCAL LAN / WI-FI PARTICIPATION LINKS */}
            <div className="p-6 rounded-2xl bg-[#0d1527] border border-cyan-500/30">
              <h3 className="text-sm font-mono text-cyan-400 font-bold uppercase tracking-wider mb-4">
                LOCAL LAN / WI-FI PARTICIPATION LINKS
              </h3>
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-black/40 border border-slate-800 flex justify-between items-center">
                  <div>
                    <div className="text-xs font-mono text-slate-400">1. PARTICIPANT MOBILE URL</div>
                    <div className="text-sm font-mono text-cyan-300 font-bold select-all">{lanUrls.user}</div>
                  </div>
                  <a href={lanUrls.user || '/user'} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-cyan-400 hover:underline">Open ↗</a>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-slate-800 flex justify-between items-center">
                  <div>
                    <div className="text-xs font-mono text-slate-400">2. PROJECTOR SCREEN URL</div>
                    <div className="text-sm font-mono text-cyan-300 font-bold select-all">{lanUrls.projector}</div>
                  </div>
                  <a href={lanUrls.projector || '/projector'} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-cyan-400 hover:underline">Open ↗</a>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-slate-800 flex justify-between items-center">
                  <div>
                    <div className="text-xs font-mono text-slate-400">3. ADMIN 1 (MASTER)</div>
                    <div className="text-sm font-mono text-cyan-300 font-bold select-all">{lanUrls.admin1}</div>
                  </div>
                  <a href={lanUrls.admin1 || '/admin'} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-cyan-400 hover:underline">Open ↗</a>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-slate-800 flex justify-between items-center">
                  <div>
                    <div className="text-xs font-mono text-slate-400">4. ADMIN 2 (CONTROLLER)</div>
                    <div className="text-sm font-mono text-cyan-300 font-bold select-all">{lanUrls.admin2}</div>
                  </div>
                  <a href={lanUrls.admin2 || '/controller'} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-pink-400 hover:underline">Open ↗</a>
                </div>
                <div className="p-3 rounded-xl bg-red-950/20 border border-red-500/40 flex justify-between items-center">
                  <div>
                    <div className="text-xs font-mono text-red-300 font-bold flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span>5. LIVE SCOREBOARD</span>
                    </div>
                    <div className="text-sm font-mono text-red-300 font-bold select-all">{lanUrls.live || `${window.location.origin}/live`}</div>
                  </div>
                  <a href={lanUrls.live || '/live'} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-red-400 hover:underline">Open ↗</a>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: Register Team */}
      {showTeamModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1527] border border-cyan-500/40 rounded-2xl p-6 max-w-lg w-full">
            <h3 className="text-xl font-display font-bold text-white mb-4">ON-THE-SPOT TEAM REGISTRATION</h3>
            <form onSubmit={handleSaveTeam} className="space-y-3 font-sans">
              <div>
                <label className="text-xs font-mono text-cyan-300">Team Name *</label>
                <input
                  type="text"
                  required
                  value={teamForm.team_name}
                  onChange={(e) => setTeamForm({ ...teamForm, team_name: e.target.value })}
                  className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-lg text-white text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-cyan-300">College Name *</label>
                <input
                  type="text"
                  required
                  value={teamForm.college_name}
                  onChange={(e) => setTeamForm({ ...teamForm, college_name: e.target.value })}
                  className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-lg text-white text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-cyan-300">Captain Name *</label>
                  <input
                    type="text"
                    required
                    value={teamForm.captain_name}
                    onChange={(e) => setTeamForm({ ...teamForm, captain_name: e.target.value })}
                    className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-lg text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-cyan-300">Contact Number</label>
                  <input
                    type="text"
                    value={teamForm.contact_number}
                    onChange={(e) => setTeamForm({ ...teamForm, contact_number: e.target.value })}
                    className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-lg text-white text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowTeamModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-500 text-black font-display font-bold text-sm"
                >
                  Generate & Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Generated Team Credentials Slip */}
      {generatedCreds && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#0d1527] border border-cyan-500/60 rounded-2xl p-6 max-w-md w-full shadow-2xl shadow-cyan-500/20 space-y-4">
            <div className="flex items-center space-x-3 text-cyan-400">
              <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-400/80 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/20">
                <CheckCircle2 className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-lg font-display font-bold text-white tracking-wide">TEAM REGISTRATION SUCCESSFUL</h3>
                <span className="text-xs font-mono text-cyan-300">CREDENTIAL SLIP GENERATED</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#080d19] border border-cyan-500/30 space-y-3 font-mono">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-xs text-slate-400">Team Name</span>
                <span className="text-sm font-display font-bold text-white">{generatedCreds.team_name}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-xs text-slate-400">College</span>
                <span className="text-xs text-slate-200">{generatedCreds.college_name}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-xs text-slate-400">Captain</span>
                <span className="text-xs text-slate-200">{generatedCreds.captain_name}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-xs text-cyan-400 font-bold">Login Username</span>
                <span className="text-base font-bold text-cyan-300 select-all">{generatedCreds.username}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-amber-400 font-bold">Password</span>
                <span className="text-base font-bold text-amber-300 select-all tracking-wider">{generatedCreds.password}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 font-sans text-center">
              Hand these login credentials to the team captain for the mobile portal at <strong className="text-cyan-300">/user</strong>.
            </p>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(`GLITCH HUNT CREDENTIALS\nTeam: ${generatedCreds.team_name}\nUsername: ${generatedCreds.username}\nPassword: ${generatedCreds.password}`);
                  alert('Credentials copied to clipboard!');
                }}
                className="px-4 py-2 rounded-xl border border-cyan-500/40 text-cyan-300 hover:bg-cyan-950 text-xs font-mono transition"
              >
                Copy Details
              </button>
              <button
                type="button"
                onClick={() => setGeneratedCreds(null)}
                className="px-5 py-2 rounded-xl bg-cyan-500 text-black font-display font-bold text-sm hover:bg-cyan-400 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}


      {/* MODAL: Add Question */}
      {/* MODAL: Add / Edit Question */}
      {showQuestionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0d1527] border border-cyan-500/40 rounded-2xl p-6 max-w-xl w-full my-8 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-xl font-display font-bold text-white flex items-center space-x-2">
                <span className={`w-2.5 h-2.5 rounded-full ${editingQuestion ? 'bg-cyan-400' : 'bg-emerald-400'}`} />
                <span>
                  {editingQuestion 
                    ? `EDIT QUESTION #${editingQuestion.question_number || editingQuestion.id}`
                    : 'ADD QUESTION TO BANK'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowQuestionModal(false);
                  setEditingQuestion(null);
                }}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Historical Data Protection Alert */}
            {editingQuestion && editingQuestion.answer_count > 0 && (
              <div className="mb-4 p-3.5 rounded-xl bg-cyan-950/80 border border-cyan-500/60 text-cyan-200 text-xs font-mono space-y-1 shadow-lg">
                <div className="font-bold flex items-center space-x-1.5 text-cyan-300">
                  <RotateCcw className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>HISTORICAL QUESTION DETECTED ({editingQuestion.answer_count} Answers Recorded)</span>
                </div>
                <p className="text-slate-300">
                  This question was used in previous event sessions. Saving your modifications will create a{' '}
                  <strong className="text-white">New Version (v{(editingQuestion.version || 1) + 1})</strong> and safely archive the parent question. All historical answers, scores, and past rankings remain 100% intact.
                </p>
              </div>
            )}

            <form onSubmit={handleSaveQuestion} className="space-y-3 font-sans">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-cyan-300 block mb-1">Target Stage / Round *</label>
                  <select
                    value={questionForm.round_id}
                    onChange={(e) => setQuestionForm({ ...questionForm, round_id: Number(e.target.value) })}
                    className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-400"
                  >
                    {rounds.map((r) => (
                      <option key={r.id} value={r.id}>
                        Stage {r.stage_number}: {r.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-mono text-cyan-300 block mb-1">Question Number</label>
                  <input
                    type="number"
                    value={questionForm.question_number ?? ''}
                    onChange={(e) => setQuestionForm({ ...questionForm, question_number: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="e.g. 1"
                    className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-cyan-300 block mb-1">Question Text *</label>
                <textarea
                  required
                  rows={2}
                  value={questionForm.question_text}
                  onChange={(e) => setQuestionForm({ ...questionForm, question_text: e.target.value })}
                  className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-mono text-cyan-400 block mb-1">Option A *</label>
                  <input
                    type="text"
                    required
                    value={questionForm.option_a}
                    onChange={(e) => setQuestionForm({ ...questionForm, option_a: e.target.value })}
                    className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-pink-400 block mb-1">Option B *</label>
                  <input
                    type="text"
                    required
                    value={questionForm.option_b}
                    onChange={(e) => setQuestionForm({ ...questionForm, option_b: e.target.value })}
                    className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-emerald-400 block mb-1">Option C *</label>
                  <input
                    type="text"
                    required
                    value={questionForm.option_c}
                    onChange={(e) => setQuestionForm({ ...questionForm, option_c: e.target.value })}
                    className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-amber-400 block mb-1">Option D *</label>
                  <input
                    type="text"
                    required
                    value={questionForm.option_d}
                    onChange={(e) => setQuestionForm({ ...questionForm, option_d: e.target.value })}
                    className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-cyan-300 block mb-1">Correct Option *</label>
                  <select
                    value={questionForm.correct_option}
                    onChange={(e) => setQuestionForm({ ...questionForm, correct_option: e.target.value })}
                    className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-400"
                  >
                    <option value="A">Option A</option>
                    <option value="B">Option B</option>
                    <option value="C">Option C</option>
                    <option value="D">Option D</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-mono text-cyan-300 block mb-1">Time Limit (Seconds) *</label>
                  <input
                    type="number"
                    min={5}
                    required
                    value={questionForm.time_limit_sec}
                    onChange={(e) => setQuestionForm({ ...questionForm, time_limit_sec: Number(e.target.value) })}
                    className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-cyan-300 block mb-1">Explanation / Rationale</label>
                <textarea
                  rows={2}
                  value={questionForm.explanation || ''}
                  onChange={(e) => setQuestionForm({ ...questionForm, explanation: e.target.value })}
                  placeholder="Optional rationale or explanation for review..."
                  className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center space-x-3 pt-1">
                <label className="text-xs font-mono text-cyan-300">Status:</label>
                <label className="flex items-center space-x-2 text-xs font-mono text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={questionForm.is_active === 1 || questionForm.is_active === true}
                    onChange={(e) => setQuestionForm({ ...questionForm, is_active: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700"
                  />
                  <span>Active & Enabled in Question Bank</span>
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowQuestionModal(false);
                    setEditingQuestion(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-mono text-slate-300 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-500 text-black font-display font-bold text-sm hover:bg-cyan-400 transition shadow-lg shadow-cyan-500/20 flex items-center space-x-1.5"
                >
                  {editingQuestion && editingQuestion.answer_count > 0 ? (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>CREATE NEW VERSION (v{(editingQuestion.version || 1) + 1})</span>
                    </>
                  ) : editingQuestion ? (
                    'UPDATE QUESTION'
                  ) : (
                    'SAVE QUESTION'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add / Edit Stage */}
      {showStageModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0d1527] border border-cyan-500/40 rounded-2xl p-6 max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-xl font-display font-bold text-white flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span>{editingStage ? `EDIT STAGE: ${editingStage.title}` : 'ADD NEW EVENT STAGE'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowStageModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStage} className="space-y-4 font-sans text-sm">
              {/* Stage Title */}
              <div>
                <label className="text-xs font-mono text-cyan-300 block mb-1">Stage Name / Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Round 1: Technical Circuitry"
                  value={stageForm.title}
                  onChange={(e) => setStageForm({ ...stageForm, title: e.target.value })}
                  className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white text-sm focus:border-cyan-400 outline-none"
                />
              </div>

              {/* Short Description (Subtitle) */}
              <div>
                <label className="text-xs font-mono text-cyan-300 block mb-1">Short Description (Subtitle)</label>
                <input
                  type="text"
                  placeholder="e.g. Core Electronics & Fundamentals"
                  value={stageForm.subtitle}
                  onChange={(e) => setStageForm({ ...stageForm, subtitle: e.target.value })}
                  className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white text-sm focus:border-cyan-400 outline-none"
                />
              </div>

              {/* Stage Type & Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-mono text-cyan-300 block mb-1">Stage Number</label>
                  <input
                    type="number"
                    min="1"
                    value={stageForm.stage_number}
                    onChange={(e) => setStageForm({ ...stageForm, stage_number: e.target.value })}
                    className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white text-sm focus:border-cyan-400 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono text-cyan-300 block mb-1">Stage Category</label>
                  <select
                    value={stageForm.is_tie_break ? '1' : '0'}
                    onChange={(e) => setStageForm({ ...stageForm, is_tie_break: Number(e.target.value) })}
                    className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white text-sm focus:border-cyan-400 outline-none"
                  >
                    <option value="0">Standard Competition Round</option>
                    <option value="1">Tie-Breaking Stage</option>
                  </select>
                </div>
              </div>

              {/* Detailed Description */}
              <div>
                <label className="text-xs font-mono text-cyan-300 block mb-1">
                  Detailed Description (Displayed on Projector & Controller)
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide in-depth context about this round, technologies covered, or instructions for participants..."
                  value={stageForm.description}
                  onChange={(e) => setStageForm({ ...stageForm, description: e.target.value })}
                  className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white text-sm focus:border-cyan-400 outline-none font-sans"
                />
              </div>

              {/* Stage Rules Editor */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-mono text-amber-300 font-bold flex items-center space-x-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>Stage Rules & Protocols (One rule per line)</span>
                  </label>
                  <span className="text-[10px] font-mono text-slate-500">
                    Press Enter for next rule
                  </span>
                </div>
                <textarea
                  rows={5}
                  placeholder={`Read the question displayed on the main projector screen.\nChoose your answer using Option A, B, C, or D on your mobile device.\nEach question has its own countdown timer.\nSubmissions are locked once sent. Only one attempt per question.\nPoints: +1 for correct answer, 0 for incorrect answer.`}
                  value={stageForm.rulesText}
                  onChange={(e) => setStageForm({ ...stageForm, rulesText: e.target.value })}
                  className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-cyan-400 outline-none leading-relaxed"
                />

                {/* Live Rules Preview */}
                {stageForm.rulesText && (
                  <div className="mt-2 p-3 rounded-xl bg-black/40 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                      Live Formatted Rules Preview:
                    </span>
                    {stageForm.rulesText.split('\n').filter(r => r.trim()).map((r, idx) => (
                      <div key={idx} className="flex items-start space-x-2 text-xs">
                        <span className="w-4 h-4 rounded bg-cyan-950 text-cyan-400 font-mono font-bold text-[10px] flex items-center justify-center shrink-0 border border-cyan-500/30">
                          {idx + 1}
                        </span>
                        <span className="text-slate-300 font-sans">{r.trim()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Scoring Settings */}
              <div>
                <label className="text-xs font-mono text-cyan-300 block mb-1">Scoring Settings</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <span className="text-[11px] font-mono text-emerald-400 block mb-0.5">+ Correct</span>
                    <input
                      type="number"
                      step="0.5"
                      value={stageForm.scoring_correct}
                      onChange={(e) => setStageForm({ ...stageForm, scoring_correct: Number(e.target.value) })}
                      className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-xl text-white text-sm"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-rose-400 block mb-0.5">- Wrong</span>
                    <input
                      type="number"
                      step="0.5"
                      value={stageForm.scoring_wrong}
                      onChange={(e) => setStageForm({ ...stageForm, scoring_wrong: Number(e.target.value) })}
                      className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-xl text-white text-sm"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-slate-400 block mb-0.5">Unanswered</span>
                    <input
                      type="number"
                      step="0.5"
                      value={stageForm.scoring_unanswered}
                      onChange={(e) => setStageForm({ ...stageForm, scoring_unanswered: Number(e.target.value) })}
                      className="w-full p-2 bg-[#080d19] border border-slate-700 rounded-xl text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Status Toggle */}
              <div className="p-3.5 rounded-xl bg-[#080d19] border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-white font-bold">Stage Active Status</div>
                  <div className="text-[11px] font-sans text-slate-400">
                    Enabled stages are available for live projection and participant play.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStageForm({ ...stageForm, is_enabled: stageForm.is_enabled === 1 ? 0 : 1 })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition ${
                    stageForm.is_enabled === 1
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                      : 'bg-rose-950 border-rose-500 text-rose-300'
                  }`}
                >
                  {stageForm.is_enabled === 1 ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>

              {/* Buttons */}
              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowStageModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-xs font-mono text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-cyan-500 text-black font-display font-bold text-sm tracking-wide hover:bg-cyan-400 shadow-lg shadow-cyan-500/20 transition"
                >
                  {editingStage ? 'Save Stage Configuration' : 'Create Stage'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Safe Delete / Disable Confirmation */}
      {showDeleteSafetyModal && stageToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1527] border border-rose-500/40 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            {deleteSafetyData?.hasDependentData ? (
              <>
                <div className="flex items-center space-x-3 text-amber-400">
                  <div className="w-10 h-10 rounded-xl bg-amber-950 border border-amber-500/50 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-white">DEPENDENT DATA PROTECTION</h3>
                    <span className="text-xs font-mono text-amber-400">STAGE CANNOT BE SILENTLY REMOVED</span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  Stage <span className="font-bold text-white">"{stageToDelete.title}"</span> currently contains{' '}
                  <span className="font-mono text-cyan-300 font-bold">{deleteSafetyData.questionCount} question(s)</span> and{' '}
                  <span className="font-mono text-cyan-300 font-bold">{deleteSafetyData.answerCount} recorded answer(s)</span>.
                </p>

                <p className="text-xs text-slate-400 font-sans">
                  Destructively deleting this stage will break database relationships and destroy question banks. We strongly recommend{' '}
                  <span className="text-emerald-400 font-semibold">disabling</span> this stage instead, which hides it from the Live Controller and Projector while keeping all data 100% intact.
                </p>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={handleDisableInstead}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 text-black font-display font-bold text-sm hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition"
                  >
                    DISABLE STAGE INSTEAD (RECOMMENDED)
                  </button>

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                      onClick={() => {
                        setShowDeleteSafetyModal(false);
                        setStageToDelete(null);
                        setDeleteSafetyData(null);
                      }}
                      className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-mono text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>

                    <button
                      onClick={() => handleConfirmDeleteStage(true)}
                      className="px-4 py-2 rounded-xl bg-rose-950 border border-rose-500/60 text-rose-400 hover:bg-rose-900 text-xs font-mono transition"
                      title="Forced hard deletion"
                    >
                      Force Hard Delete
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center space-x-3 text-rose-400">
                  <div className="w-10 h-10 rounded-xl bg-rose-950 border border-rose-500/50 flex items-center justify-center shrink-0">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-white">CONFIRM STAGE DELETION</h3>
                    <span className="text-xs font-mono text-slate-400">STAGE HAS NO DEPENDENT DATA</span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  Are you sure you want to permanently delete stage{' '}
                  <span className="font-bold text-white">"{stageToDelete.title}"</span>? This stage has 0 questions and 0 answers.
                </p>

                <div className="flex justify-end space-x-3 pt-3">
                  <button
                    onClick={() => {
                      setShowDeleteSafetyModal(false);
                      setStageToDelete(null);
                      setDeleteSafetyData(null);
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-mono text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleConfirmDeleteStage(false)}
                    className="px-5 py-2 rounded-xl bg-rose-600 text-white font-display font-bold text-sm hover:bg-rose-500 transition"
                  >
                    Delete Stage
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Question Delete / Disable Safety Confirmation */}
      {showQuestionDeleteModal && questionToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1527] border border-amber-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            {questionToDelete.answer_count && questionToDelete.answer_count > 0 ? (
              <>
                <div className="flex items-center space-x-3 text-amber-400">
                  <div className="w-10 h-10 rounded-xl bg-amber-950 border border-amber-500/50 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-white">QUESTION HAS EVENT HISTORY</h3>
                    <span className="text-xs font-mono text-amber-400">CANNOT BE PERMANENTLY DELETED</span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  This question cannot be permanently deleted because it is referenced by existing event data.
                </p>

                <p className="text-xs text-slate-400 font-sans">
                  It has existing answers or scoring records. It will be disabled instead to preserve event history.
                </p>

                <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                  <button
                    onClick={() => {
                      setShowQuestionDeleteModal(false);
                      setQuestionToDelete(null);
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-mono text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDisableQuestion}
                    className="px-5 py-2 rounded-xl bg-amber-500 text-black font-display font-bold text-sm hover:bg-amber-400 shadow-lg shadow-amber-500/20 transition"
                  >
                    Disable Question
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center space-x-3 text-rose-400">
                  <div className="w-10 h-10 rounded-xl bg-rose-950 border border-rose-500/50 flex items-center justify-center shrink-0">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-white">DELETE QUESTION?</h3>
                    <span className="text-xs font-mono text-slate-400">CONFIRM PERMANENT DELETION</span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 font-sans leading-relaxed">
                  This question has no event history.
                </p>

                <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                  <button
                    onClick={() => {
                      setShowQuestionDeleteModal(false);
                      setQuestionToDelete(null);
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-mono text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDeleteQuestion}
                    className="px-5 py-2 rounded-xl bg-rose-600 text-white font-display font-bold text-sm hover:bg-rose-500 transition"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Round Result Breakdown */}
      {showRoundDetailModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1527] border border-cyan-500/40 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-xl font-display font-bold text-white flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  <span>
                    ROUND RESULT: {roundDetailData?.round ? `STAGE ${roundDetailData.round.stage_number} - ${roundDetailData.round.title}` : 'ROUND DETAILS'}
                  </span>
                </h3>
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  Event Run: {selectedEventRun?.event_run_id} • Date: {selectedEventRun?.event_date}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowRoundDetailModal(false);
                  setRoundDetailData(null);
                }}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {roundDetailLoading ? (
              <div className="py-12 text-center text-cyan-400 font-mono text-xs">
                Loading round scoring breakdown...
              </div>
            ) : roundDetailData ? (
              <div className="space-y-4">
                {/* Scoring Rules summary */}
                <div className="p-3 rounded-xl bg-[#080d19] border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                  <span className="text-slate-400">SCORING RULES:</span>
                  <div className="flex items-center space-x-4">
                    <span className="text-emerald-400 font-bold">+{roundDetailData.round?.scoring_correct || 1} Correct</span>
                    <span className="text-rose-400">{roundDetailData.round?.scoring_wrong || 0} Wrong</span>
                    <span className="text-slate-500">{roundDetailData.round?.scoring_unanswered || 0} Unanswered</span>
                  </div>
                </div>

                {/* Team Results Table */}
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#080d19] border-b border-slate-800 text-cyan-400 uppercase">
                      <tr>
                        <th className="p-3">Rank</th>
                        <th className="p-3">Team Name</th>
                        <th className="p-3">College</th>
                        <th className="p-3 text-center">Score</th>
                        <th className="p-3 text-center">Correct Answers</th>
                        <th className="p-3 text-right">Avg Speed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {roundDetailData.results && roundDetailData.results.map((r) => (
                        <tr key={r.teamId} className="hover:bg-slate-800/40">
                          <td className="p-3 font-bold text-cyan-400">#{r.rank}</td>
                          <td className="p-3 font-display font-bold text-white text-sm">
                            {r.teamName}
                            {r.isTied && (
                              <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                TIED
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-slate-300">{r.collegeName}</td>
                          <td className="p-3 text-center font-bold text-white text-sm">{r.score}</td>
                          <td className="p-3 text-center text-emerald-400 font-bold">
                            {r.correctCount} / {r.answersCount}
                          </td>
                          <td className="p-3 text-right text-slate-400">{r.avgSpeedMs}ms</td>
                        </tr>
                      ))}
                      {(!roundDetailData.results || roundDetailData.results.length === 0) && (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-500">
                            No team answers recorded for this stage.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowRoundDetailModal(false);
                  setRoundDetailData(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-white transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create New Event Run */}
      {showNewEventModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1527] border border-cyan-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-display font-bold text-white flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span>CREATE NEW EVENT RUN</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewEventModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewEventRun} className="space-y-4 font-sans text-sm">
              <div>
                <label className="text-xs font-mono text-cyan-300 block mb-1">
                  Event Date (DD-MM-YYYY) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 15-09-2026"
                  value={newEventForm.event_date}
                  onChange={(e) => setNewEventForm({ ...newEventForm, event_date: e.target.value })}
                  className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white font-mono text-sm focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-cyan-300 block mb-1">
                  Event Session Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GLITCH HUNT 2026 - Morning Session"
                  value={newEventForm.event_name}
                  onChange={(e) => setNewEventForm({ ...newEventForm, event_name: e.target.value })}
                  className="w-full p-2.5 bg-[#080d19] border border-slate-700 rounded-xl text-white text-sm focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="is_test_run"
                  checked={newEventForm.is_test_run}
                  onChange={(e) => setNewEventForm({ ...newEventForm, is_test_run: e.target.checked })}
                  className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700"
                />
                <label htmlFor="is_test_run" className="text-xs font-mono text-slate-300 cursor-pointer">
                  Mark as Test Run (isolated from official event history)
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewEventModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-mono text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-500 text-black font-display font-bold text-sm hover:bg-cyan-400 shadow-md shadow-cyan-500/20 transition"
                >
                  Initialize Run
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
