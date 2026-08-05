import { useState, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from './config';
import ThreeWayChat from './components/ThreeWayChat';
import TaskVerificationModal from './components/TaskVerificationModal';
import { useStudentData } from './hooks/useStudentData';
import { useChatEvaluation } from './hooks/useChatEvaluation';
import Banners from './components/dashboard/Banners';
import ProgressTable from './components/dashboard/ProgressTable';
import AIChatbot from './components/dashboard/AIChatbot';
import AttendanceStatus from './components/dashboard/AttendanceStatus';

interface StudentDashboardProps {
  sessionId: string;
  onReschedule: () => void;
}

export default function StudentDashboard({ sessionId, onReschedule: _onReschedule }: StudentDashboardProps) {
  // Use custom hooks
  const {
    schedule,
    setSchedule,
    loading,
    attendance,
    managementType,
    voucherExpiry,
    getRemainingVoucherDays
  } = useStudentData(sessionId);

  // 성취율 상태
  const [achievementRates, setAchievementRates] = useState<Record<string, number>>({});

  // 1줄 요약 및 완료 인증 모달 상태
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<{weekNum: number, taskIdx: number, task: any} | null>(null);

  const handleOpenVerifyModal = useCallback((weekNum: number, taskIdx: number, task: any) => {
    setVerifyTarget({ weekNum, taskIdx, task });
    setShowVerifyModal(true);
  }, []);

  const toggleTask = useCallback(async (weekNum: number, taskIdx: number, forceCompleted?: boolean) => {
    if (!schedule) return;
    
    const newSchedule = { ...schedule };
    const week = newSchedule.payload.curriculum.find((w: any) => w.week_number === weekNum);
    const task = week.daily_tasks[taskIdx];
    const newCompleted = forceCompleted !== undefined ? forceCompleted : !task.completed;
    task.completed = newCompleted;
    setSchedule(newSchedule);
    
    try {
      await axios.patch(`${API_URL}/knowledge/schedule/${schedule.doc_id}/task`, {
        week_number: weekNum,
        task_index: taskIdx,
        completed: newCompleted
      });
    } catch (err) {
      console.error(err);
    }
  }, [schedule, setSchedule]);

  const chatEval = useChatEvaluation(sessionId, toggleTask, setAchievementRates);

  if (loading) return <div style={{ color: '#fff', textAlign: 'center', padding: '50px' }}>일정을 불러오는 중입니다...</div>;
  if (!schedule) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#fff' }}>확정된 일정이 없습니다. 온보딩을 완료해주세요!</div>;

  const remainingDays = getRemainingVoucherDays();

  return (
    <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, minHeight: 0, paddingBottom: '20px' }}>
      
      <Banners 
        managementType={managementType} 
        remainingDays={remainingDays} 
        voucherExpiry={voucherExpiry} 
      />

      <ProgressTable 
        schedule={schedule}
        achievementRates={achievementRates}
        toggleTask={toggleTask}
        handleOpenVerifyModal={handleOpenVerifyModal}
        startEvaluation={chatEval.startEvaluation}
      />

      {/* 중단: AI 챗봇 창 & 3자 실시간 메시지 연동 */}
      <div style={{ display: 'flex', gap: '20px', flexShrink: 0, flexWrap: 'wrap' }}>
        <AIChatbot 
          messages={chatEval.messages}
          inputMsg={chatEval.inputMsg}
          setInputMsg={chatEval.setInputMsg}
          evaluatingTaskInfo={chatEval.evaluatingTaskInfo}
          loadingChat={chatEval.loadingChat}
          isRecording={chatEval.isRecording}
          chatEndRef={chatEval.chatEndRef}
          startRecording={chatEval.startRecording}
          handleSendEvaluation={chatEval.handleSendEvaluation}
        />

        {/* Right: 3자 실시간 메시지 창 */}
        <ThreeWayChat sessionId={sessionId} currentUserRole="student" height="400px" />
      </div>

      <AttendanceStatus 
        managementType={managementType} 
        attendance={attendance} 
      />

      {/* 1줄 학습 요약 & 완료 인증 모달 */}
      {showVerifyModal && verifyTarget && (
        <TaskVerificationModal
          sessionId={sessionId}
          targetTask={verifyTarget}
          onClose={() => setShowVerifyModal(false)}
          onVerified={(weekNum, taskIdx) => {
            toggleTask(weekNum, taskIdx, true);
          }}
        />
      )}
      
    </div>
  );
}
