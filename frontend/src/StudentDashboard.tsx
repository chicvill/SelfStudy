import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface StudentDashboardProps {
  sessionId: string;
  onReschedule: () => void;
}

export default function StudentDashboard({ sessionId, onReschedule }: StudentDashboardProps) {
  const [schedule, setSchedule] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  
  // Chat Evaluation States
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: "안녕하세요! 오늘의 진도 점검을 도와드릴 AI입니다.\n위 리스트에서 [🎙️ 평가받기] 버튼을 눌러 평가를 시작해보세요."
  }]);
  const [inputMsg, setInputMsg] = useState("");
  const [evaluatingTaskInfo, setEvaluatingTaskInfo] = useState<{week_number: number, task_index: number, task_title: string} | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // 성취율 상태 (Mocking for now)
  const [achievementRates, setAchievementRates] = useState<Record<string, number>>({});

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSchedule = async () => {
    try {
      const resp = await axios.get(`${API_URL}/knowledge/student/${sessionId}`);
      if (resp.data.data) {
        setSchedule(resp.data.data);
        if (resp.data.data.payload?.spreadsheet_data?.subjects?.length > 0) {
          setSelectedSubject(resp.data.data.payload.spreadsheet_data.subjects[0].subject_name);
        }
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (sessionId) fetchSchedule();
  }, [sessionId]);

  const toggleTask = async (weekNum: number, taskIdx: number, forceCompleted?: boolean) => {
    if (!schedule) return;
    
    // 낙관적 업데이트
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
  };

  const payload = schedule?.payload || {};

  const startEvaluation = (week_number: number, task_index: number, task: any) => {
    setEvaluatingTaskInfo({ week_number, task_index, task_title: task.task_title });
    setMessages([{ role: 'assistant', content: `[메타인지 평가 모드]\n'${task.task_title}' 단원의 학습을 마치셨군요! 가장 중요하게 배운 핵심 개념 한 가지를 동생에게 설명하듯 이야기해주세요.` }]);
  };

  const handleSendEvaluation = async () => {
    if (!inputMsg.trim()) return;
    const currentMsg = inputMsg;
    setInputMsg("");
    setMessages(prev => [...prev, { role: 'user', content: currentMsg }]);
    setLoadingChat(true);

    try {
      if (evaluatingTaskInfo) {
        // 실제 AI 평가 API 호출
        const resp = await axios.post(`${API_URL}/knowledge/evaluate`, {
          session_id: sessionId,
          subject: evaluatingTaskInfo.task_title,
          explanation: currentMsg
        });
        
        const score = resp.data.score || 0;
        const feedback = resp.data.feedback || "평가가 완료되었습니다.";
        
        setMessages(prev => [...prev, { role: 'assistant', content: `[점수: ${score}점]\n${feedback}` }]);
        
        // 성취율 반영 및 완료 처리
        setAchievementRates(prev => ({...prev, [`${evaluatingTaskInfo.week_number}_${evaluatingTaskInfo.task_index}`]: score}));
        toggleTask(evaluatingTaskInfo.week_number, evaluatingTaskInfo.task_index, true);
        
        setEvaluatingTaskInfo(null);
      } else {
        // 자유 대화
        const resp = await axios.post(`${API_URL}/knowledge/chat`, {
          session_id: sessionId,
          message: `[자유 질문]\n사용자질문: ${currentMsg}`,
          state_override: { current_stage: 5 }
        });
        
        const reply = resp.data.reply;
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: "응답 처리 중 오류가 발생했습니다. 다시 시도해주세요." }]);
    }
    setLoadingChat(false);
  };

  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("이 브라우저는 음성 인식을 지원하지 않습니다. Chrome을 사용해주세요.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputMsg(prev => prev + (prev ? " " : "") + transcript);
    };
    
    recognition.start();
  };

  // 평탄화된 일자별 리스트
  let flatTasks: any[] = [];
  payload.curriculum?.forEach((week: any) => {
    week.daily_tasks?.forEach((task: any, idx: number) => {
      flatTasks.push({ week_number: week.week_number, task_index: idx, ...task });
    });
  });

  const filteredTasks = flatTasks.filter(t => t.subject === selectedSubject);

  useEffect(() => {
    if (listContainerRef.current && filteredTasks.length > 0) {
      const todayStr = new Date().toISOString().split('T')[0];
      const rows = listContainerRef.current.querySelectorAll('tr[data-date]');
      let targetRow: HTMLElement | null = null;
      
      for (let i = 0; i < rows.length; i++) {
        const rowDate = rows[i].getAttribute('data-date');
        if (rowDate && rowDate >= todayStr) {
          targetRow = rows[i] as HTMLElement;
          break; // 가장 가까운 미래 혹은 오늘
        }
      }
      if (!targetRow && rows.length > 0) targetRow = rows[rows.length - 1] as HTMLElement;

      if (targetRow) {
        const container = listContainerRef.current;
        const scrollPos = targetRow.offsetTop - (container.clientHeight / 2) + (targetRow.clientHeight / 2);
        // 조금 지연을 주어 렌더링 후 스크롤되도록 함
        setTimeout(() => {
          container.scrollTo({ top: scrollPos, behavior: 'smooth' });
        }, 100);
      }
    }
  }, [filteredTasks.length, selectedSubject]);

  if (loading) return <div style={{ color: '#fff', textAlign: 'center', padding: '50px' }}>일정을 불러오는 중입니다...</div>;
  if (!schedule) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#fff' }}>확정된 일정이 없습니다. 온보딩을 완료해주세요!</div>;

  return (
    <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, minHeight: 0, paddingBottom: '20px' }}>
      
      {/* 상단: 일일 진도 계획표 */}
      <div style={{ background: '#fff', padding: '20px 30px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #eee', paddingBottom: '20px', marginBottom: '20px' }}>
          <div>
            <h2 style={{ color: '#1976d2', margin: '0 0 10px 0' }}>🏃 나의 진도 계획표</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <p style={{ margin: 0, color: '#666' }}>[{payload.plan_title || '진도 계획'}]</p>
              <span style={{ fontSize: '13px', color: '#888', background: '#f5f5f5', padding: '4px 10px', borderRadius: '12px' }}>
                부모님 참관 코드: <strong>{payload.observer_code || ''}</strong>
              </span>
            </div>
          </div>
          <button 
            onClick={() => onReschedule()}
            style={{ background: '#d32f2f', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            🚨 전체 일정 재조정 (AI)
          </button>
        </div>

        {/* 과목 탭 */}
        <div style={{ display: 'flex', gap: '5px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '5px' }}>
          {(payload.spreadsheet_data?.subjects || []).map((subj: any) => (
            <button
              key={subj.subject_name}
              onClick={() => setSelectedSubject(subj.subject_name)}
              style={{
                background: selectedSubject === subj.subject_name ? '#1976d2' : '#f0f0f0',
                color: selectedSubject === subj.subject_name ? '#fff' : '#555',
                border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer',
                fontWeight: selectedSubject === subj.subject_name ? 'bold' : 'normal',
                whiteSpace: 'nowrap', fontSize: '15px'
              }}
            >
              {subj.subject_name}
            </button>
          ))}
        </div>

        {/* 스크롤 가능한 일자별 리스트 (정확히 5줄 정도만 보이도록 높이 제한) */}
        <div ref={listContainerRef} style={{ height: '260px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f5f5f5', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', zIndex: 1 }}>
              <tr>
                <th style={{ padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid #ddd', background: '#f5f5f5' }}>일자 (요일)</th>
                <th style={{ padding: '12px 15px', textAlign: 'center', borderBottom: '2px solid #ddd', background: '#f5f5f5' }}>배정시간</th>
                <th style={{ padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid #ddd', background: '#f5f5f5' }}>단원명</th>
                <th style={{ padding: '12px 15px', textAlign: 'center', borderBottom: '2px solid #ddd', background: '#f5f5f5' }}>상태 / 성취율</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task, idx) => {
                const isChecked = task.completed;
                const achievementKey = `${task.week_number}_${task.task_index}`;
                const rate = achievementRates[achievementKey] || (isChecked ? 100 : null);
                
                return (
                  <tr key={idx} data-date={task.date} style={{ borderBottom: '1px solid #eee', background: isChecked ? '#fdfdfd' : '#fff', height: '52px' }}>
                    <td style={{ padding: '12px 15px', color: '#555', fontWeight: 'bold' }}>{task.date} ({(typeof task.day === 'string' && task.day.includes('- ')) ? task.day.split('- ')[1] : task.day || '?'})</td>
                    <td style={{ padding: '12px 15px', textAlign: 'center', color: '#666' }}>{task.estimated_minutes}분</td>
                    <td style={{ padding: '12px 15px', color: isChecked ? '#aaa' : '#333', textDecoration: isChecked ? 'line-through' : 'none' }}>{task.unit_name}</td>
                    <td style={{ padding: '12px 15px', textAlign: 'center' }}>
                      {isChecked ? (
                        <span style={{ color: '#4caf50', fontWeight: 'bold' }}>성취율: {rate}%</span>
                      ) : (
                        <button 
                          onClick={() => startEvaluation(task.week_number, task.task_index, task)}
                          style={{ background: '#e8f5e9', color: '#2e7d32', border: '1px solid #81c784', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                        >
                          🎙️ 평가받기
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredTasks.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#999' }}>해당 과목의 일정이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 하단: AI 챗봇 창 */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, border: '1px solid #bbdefb' }}>
        <div style={{ background: '#1976d2', padding: '15px 20px', borderRadius: '12px 12px 0 0', color: '#fff', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
          <span>🤖 AI 학습 평가 챗봇</span>
          {evaluatingTaskInfo && <span style={{ fontSize: '13px', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '10px' }}>평가 진행 중: {evaluatingTaskInfo.task_title}</span>}
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', background: '#f8fbff' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%', padding: '12px 16px', borderRadius: '12px',
                background: msg.role === 'user' ? '#1976d2' : '#fff',
                color: msg.role === 'user' ? '#fff' : '#333',
                border: msg.role === 'user' ? 'none' : '1px solid #e0e0e0',
                boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                whiteSpace: 'pre-wrap', lineHeight: '1.5', fontSize: '14px'
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loadingChat && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: '#fff', border: '1px solid #e0e0e0', padding: '12px 16px', borderRadius: '12px', color: '#888', fontSize: '14px' }}>AI가 생각 중입니다... ✍️</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div style={{ padding: '15px', borderTop: '1px solid #eee', background: '#fff', borderRadius: '0 0 12px 12px', display: 'flex', gap: '10px' }}>
          <button 
            onClick={startRecording}
            title="마이크로 입력하기"
            style={{ 
              background: isRecording ? '#ffebee' : '#f5f5f5', 
              color: isRecording ? '#d32f2f' : '#555', 
              border: '1px solid #ccc', 
              borderRadius: '8px', 
              width: '45px',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
              transition: 'all 0.2s'
            }}
          >
            {isRecording ? '🛑' : '🎤'}
          </button>
          <input
            type="text"
            value={inputMsg}
            onChange={e => setInputMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendEvaluation()}
            placeholder={evaluatingTaskInfo ? "학습한 내용을 설명해주세요..." : "무엇이든 자유롭게 질문하거나 [평가받기]를 눌러주세요..."}
            disabled={loadingChat}
            style={{ flex: 1, padding: '12px 15px', borderRadius: '8px', border: '1px solid #ccc', outline: 'none', fontSize: '14px' }}
          />
          <button 
            onClick={handleSendEvaluation}
            disabled={!inputMsg.trim() || loadingChat}
            style={{ background: !inputMsg.trim() ? '#ccc' : '#1976d2', color: '#fff', border: 'none', padding: '0 20px', borderRadius: '8px', cursor: !inputMsg.trim() ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
          >
            전송
          </button>
        </div>
      </div>
      
    </div>
  );
}
