import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatWizardProps {
  sessionId: string;
  rescheduleScheduleId?: string | null;
  onFinalized?: () => void;
}

export default function AIChatWizard({ sessionId, rescheduleScheduleId, onFinalized }: AIChatWizardProps) {
  const [stage, setStage] = useState<number>(1);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState("");
  const [collectedData, setCollectedData] = useState<any>({});
  const [draftSchedule, setDraftSchedule] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  const [observerCode, setObserverCode] = useState("");
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 최초 진입 시 로딩 상태 등 초기화
    if (rescheduleScheduleId) {
      // 리스케줄링 모드로 강제 진입
      setLoading(true);
      axios.post(`${API_URL}/knowledge/chat/reschedule`, {
        session_id: sessionId,
        schedule_id: rescheduleScheduleId
      }).then(() => {
        // 모드 3 전환 후, 대화내역 등을 다시 불러와야 하지만 
        // 간단히 인사 메시지를 수동으로 넣거나, 백엔드에서 반환된 메시지를 사용할 수 있습니다.
        setMessages([{ role: 'assistant', content: '진도가 밀려서 속상하시죠? 괜찮습니다! 현재까지의 달성률을 바탕으로 남은 일정을 어떻게 조정하면 좋을지 말씀해 주세요.' }]);
        setStage(3);
        setLoading(false);
      }).catch(err => {
        console.error(err);
        setLoading(false);
      });
    } else {
      setMessages([{
        role: 'assistant',
        content: "안녕하세요! 나만의 맞춤형 학습 계획을 세워드릴 AI 튜터입니다. 😊\n어떤 시험이나 자격증을 목표로 하고 계신지, 언제까지 달성하고 싶으신지 편하게 말씀해 주세요! (잘 모르시겠다면 '추천해 줘'라고 하셔도 됩니다.)"
      }]);
    }
  }, [sessionId, rescheduleScheduleId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, draftSchedule]);

  useEffect(() => {
    if (isSpeakerEnabled && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant') {
        const utterance = new SpeechSynthesisUtterance(lastMsg.content);
        utterance.lang = 'ko-KR';
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [messages, isSpeakerEnabled]);

  const handleMicClick = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputMsg(prev => prev + (prev ? " " : "") + transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;

    const userText = inputMsg;
    setInputMsg("");
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/knowledge/chat`, {
        session_id: sessionId,
        message: userText
      });

      const { ai_response, current_stage, collected_data, draft_schedule } = response.data;
      
      setMessages(prev => [...prev, { role: 'assistant', content: ai_response }]);
      setStage(current_stage);
      setCollectedData(collected_data);
      if (draft_schedule) {
        setDraftSchedule(draft_schedule);
      }

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: "시스템 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }]);
    }
    setLoading(false);
  };

  const handleFinalize = async () => {
    if (!confirm("현재 일정으로 확정하시겠습니까?")) return;
    setLoading(true);
    try {
      const resp = await axios.post(`${API_URL}/knowledge/finalize`, { session_id: sessionId });
      setIsFinalized(true);
      setObserverCode(resp.data.observer_code);
      if (onFinalized) {
        setTimeout(onFinalized, 3000); // 3초 뒤 대시보드로 이동
      }
    } catch (err) {
      alert("확정 처리 중 오류가 발생했습니다.");
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', height: '85vh', maxWidth: '1300px', margin: '10px auto', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
      
      {/* 좌측 패널: 진행 상황 및 초안 일정 렌더링 */}
      <div style={{ width: '45%', background: '#f8f9fa', padding: '30px', borderRight: '1px solid #eee', overflowY: 'auto' }}>
        <h2 style={{ color: '#1976d2', marginTop: 0 }}>📊 {stage === 1 ? '목표 설정 중...' : (stage === 3 ? '일정 재조정 중... 🔄' : '맞춤형 진도 계획표 (초안)')}</h2>
        
        {stage === 1 && (
          <div style={{ marginTop: '40px', background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
            <h3 style={{ fontSize: '16px', marginTop: 0, color: '#555', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>📝 실시간 수집 데이터</h3>
            {Object.keys(collectedData).length === 0 ? (
              <p style={{ color: '#999', fontSize: '14px' }}>AI와 대화하며 목표를 설정해 보세요!</p>
            ) : (
              <ul style={{ paddingLeft: '20px', fontSize: '14px', lineHeight: '1.6', color: '#333' }}>
                {Object.entries(collectedData).map(([k, v]) => (
                  <li key={k}><strong>{k}:</strong> {typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {(stage === 2 || stage === 3) && draftSchedule && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ background: '#e3f2fd', padding: '15px', borderRadius: '8px', marginBottom: '20px', color: '#0d47a1', fontSize: '14px' }}>
              💡 <strong>{stage === 3 ? "AI가 재배치한 새로운 일정입니다!" : "AI가 추천하는 초안입니다!"}</strong> 우측 채팅창에 원하는 수정사항을 말하면 AI가 즉시 반영해 드립니다.
            </div>

            <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #bbdefb', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
              <h3 style={{ marginTop: 0, color: '#1565c0' }}>{draftSchedule.plan_title || "진도 계획"}</h3>
              <p style={{ fontSize: '14px', color: '#555' }}><strong>전략:</strong> {draftSchedule.overall_strategy}</p>
              
              <div style={{ marginTop: '20px' }}>
                {draftSchedule.curriculum?.map((week: any) => (
                  <div key={week.week_number} style={{ marginBottom: '15px', borderLeft: '3px solid #1976d2', paddingLeft: '15px' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#333' }}>Week {week.week_number}: {week.week_theme}</h4>
                    <ul style={{ margin: 0, paddingLeft: '15px', fontSize: '13px', color: '#666' }}>
                      {week.daily_tasks?.map((task: any, idx: number) => (
                        <li key={idx} style={{ padding: '3px 0' }}>
                          <strong style={{ color: task.completed ? '#2e7d32' : '#1976d2' }}>{task.day}</strong>: 
                          <span style={{ textDecoration: task.completed ? 'line-through' : 'none', color: task.completed ? '#888' : '#666' }}> [{task.subject}] {task.task_title} ({task.estimated_minutes}분) </span>
                          {task.completed && <span style={{fontSize:'12px', color:'#2e7d32', marginLeft:'5px'}}>✅완료</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {!isFinalized && (
              <button 
                onClick={handleFinalize}
                disabled={loading}
                style={{ marginTop: '20px', width: '100%', background: '#4caf50', color: '#fff', padding: '15px', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(76,175,80,0.3)' }}
              >
                ✅ 이 계획으로 확정하기
              </button>
            )}

            {isFinalized && (
              <div style={{ marginTop: '20px', background: '#e8f5e9', padding: '20px', borderRadius: '8px', border: '1px solid #c8e6c9', textAlign: 'center' }}>
                <h3 style={{ color: '#2e7d32', margin: '0 0 10px 0' }}>🎉 일정이 확정되었습니다!</h3>
                <p style={{ color: '#1b5e20', fontSize: '14px', margin: 0 }}>
                  부모님이나 선생님께 아래 <strong>참관 코드</strong>를 알려주시면 진도표를 공유할 수 있습니다.<br/><br/>
                  <span style={{ background: '#fff', padding: '10px 20px', fontSize: '24px', fontWeight: 'bold', letterSpacing: '3px', borderRadius: '8px', border: '2px dashed #4caf50', display: 'inline-block' }}>
                    {observerCode}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 우측 패널: AI 채팅창 */}
      <div style={{ width: '55%', display: 'flex', flexDirection: 'column', background: '#eef2f5' }}>
        <div style={{ padding: '10px 20px', background: '#fff', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              setIsSpeakerEnabled(!isSpeakerEnabled);
              if (isSpeakerEnabled) window.speechSynthesis.cancel();
            }}
            style={{ background: isSpeakerEnabled ? '#4caf50' : '#e0e0e0', color: isSpeakerEnabled ? '#fff' : '#555', border: 'none', padding: '8px 15px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
          >
            {isSpeakerEnabled ? '🔊 AI 음성 켜짐' : '🔈 AI 음성 꺼짐'}
          </button>
        </div>
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{ 
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              background: msg.role === 'user' ? '#1976d2' : '#fff',
              color: msg.role === 'user' ? '#fff' : '#333',
              padding: '12px 18px',
              borderRadius: '20px',
              maxWidth: '80%',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap'
            }}>
              {msg.content}
            </div>
          ))}
          {loading && (
            <div style={{ alignSelf: 'flex-start', background: '#fff', padding: '12px 18px', borderRadius: '20px', color: '#888' }}>
              AI가 생각 중입니다...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* 입력창 */}
        <div style={{ background: '#fff', padding: '15px 20px', borderTop: '1px solid #ddd' }}>
          {isFinalized ? (
            <div style={{ textAlign: 'center', color: '#4caf50', fontWeight: 'bold' }}>
              모든 절차가 완료되었습니다! 🎉 대시보드로 이동하세요.
            </div>
          ) : (
            <form onSubmit={handleSend} style={{ display: 'flex', gap: '10px' }}>
              <button 
                type="button"
                onClick={handleMicClick}
                disabled={loading || isListening}
                style={{ background: isListening ? '#f44336' : '#e0e0e0', color: isListening ? '#fff' : '#333', border: 'none', padding: '0 15px', borderRadius: '20px', cursor: 'pointer', fontSize: '18px' }}
                title="마이크로 말하기"
              >
                🎤
              </button>
              <input 
                type="text" 
                value={inputMsg}
                onChange={e => setInputMsg(e.target.value)}
                placeholder={stage === 1 ? "답변을 입력해주세요..." : "수정하고 싶은 내용을 말해주세요..."} 
                disabled={loading}
                style={{ flex: 1, padding: '12px', borderRadius: '20px', border: '1px solid #ccc', outline: 'none' }}
              />
              <button 
                type="submit" 
                disabled={loading || !inputMsg.trim()}
                style={{ background: '#1976d2', color: '#fff', border: 'none', padding: '0 20px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                전송
              </button>
            </form>
          )}
        </div>
      </div>

    </div>
  );
}
