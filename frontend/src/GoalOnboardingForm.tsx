import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

interface GoalOnboardingFormProps {
  sessionId: string;
  userId: string;
  onComplete: (formData: any) => void;
}

export default function GoalOnboardingForm({ sessionId, userId, onComplete }: GoalOnboardingFormProps) {
  const [loading, setLoading] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  
  // Who
  const [ageGroup, setAgeGroup] = useState('');
  const [currentLevel, setCurrentLevel] = useState('');
  const [managementType, setManagementType] = useState('독학형'); // '독학형' or '관리형'
  const [scheduledTimes, setScheduledTimes] = useState<Record<string, { in: string; out: string }>>({
    '월': { in: '09:00', out: '18:00' },
    '화': { in: '09:00', out: '18:00' },
    '수': { in: '09:00', out: '18:00' },
    '목': { in: '09:00', out: '18:00' },
    '금': { in: '09:00', out: '18:00' },
    '토': { in: '09:00', out: '18:00' },
    '일': { in: '09:00', out: '18:00' }
  });
  
  // What
  const [targetGoal, setTargetGoal] = useState('');
  const [materials, setMaterials] = useState('');
  
  // When & How
  const [targetDate, setTargetDate] = useState('');
  const [hoursPerDayMap, setHoursPerDayMap] = useState<Record<string, number>>({
    '월': 2, '화': 2, '수': 2, '목': 2, '금': 2, '토': 2, '일': 2
  });
  const [wantsBuffer, setWantsBuffer] = useState(true);

  const daysOfWeek = ['월', '화', '수', '목', '금', '토', '일'];

  useEffect(() => {
    // Fetch user profile on mount
    axios.get(`${API_URL}/knowledge/profile/${userId}`)
      .then(res => {
        const profile = res.data.data;
        if (profile && Object.keys(profile).length > 0) {
          setAgeGroup(profile['학습자_정보'] || '');
          setCurrentLevel(profile['현재_수준'] || '');
          setTargetGoal(profile['목표'] || '');
          setTargetDate(profile['마감일'] || '');
          
          const storedHours = profile['일일학습시간'];
          if (typeof storedHours === 'object' && storedHours !== null) {
            setHoursPerDayMap(storedHours);
          } else {
            // 호환성 처리: 기존 문자열 형태면 일괄 2시간으로 임시 매핑
            const defaultMap: Record<string, number> = {};
            (profile['공부가능요일'] || []).forEach((d: string) => defaultMap[d] = 2);
            setHoursPerDayMap(defaultMap);
          }
          
          setWantsBuffer(profile['예비일_선호'] !== false);
          setManagementType(profile['관리방식'] || '독학형');
          if (profile['등하원예약시간']) {
            setScheduledTimes(profile['등하원예약시간']);
          }
        }
      })
      .catch(err => console.error("Failed to load profile", err));

    // Check if there is an ongoing session
    axios.get(`${API_URL}/knowledge/chat/${sessionId}`)
      .then(res => {
        if (res.data && res.data.data) {
          const session = res.data.data;
          if (session.current_stage >= 2 && session.draft_schedule) {
            setHasDraft(true);
          }
        }
      })
      .catch(err => console.error("Failed to load session", err));
  }, [userId, sessionId]);

  const handleTimeChange = (day: string, type: 'in' | 'out', val: string) => {
    setScheduledTimes(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [type]: val
      }
    }));
  };

  const handleHourChange = (day: string, val: string) => {
    const num = parseInt(val, 10);
    setHoursPerDayMap(prev => {
      const newMap = { ...prev };
      if (isNaN(num) || num <= 0) {
        delete newMap[day];
      } else {
        newMap[day] = num;
      }
      return newMap;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const activeDays = Object.keys(hoursPerDayMap).filter(day => hoursPerDayMap[day] > 0);
    
    if (!ageGroup || !targetGoal || !targetDate || activeDays.length === 0) {
      alert("필수 항목(요일별 학습 시간 포함)을 모두 입력해주세요.");
      return;
    }

    const formData = {
      "학습자_정보": ageGroup,
      "현재_수준": currentLevel,
      "목표": targetGoal,
      "교재_및_범위": materials,
      "마감일": targetDate,
      "공부가능요일": activeDays,
      "일일학습시간": hoursPerDayMap,
      "예비일_선호": wantsBuffer,
      "관리방식": managementType,
      "등하원예약시간": scheduledTimes
    };

    if (hasDraft) {
      onComplete(formData);
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API_URL}/knowledge/profile`, {
        user_id: userId,
        form_data: formData
      });

      // 기존에는 여기서 form_onboard 및 finalize를 호출했으나,
      // 15단계 개편에 따라 formData만 넘겨주고 Stepper로 제어권을 넘김.
      onComplete(formData);
    } catch (err) {
      console.error(err);
      alert("진도표 생성 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '850px', margin: '-30px auto 40px auto', background: '#fff', borderRadius: '30px', padding: '50px 40px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', position: 'relative', zIndex: 10 }}>
      <h2 style={{ textAlign: 'center', color: '#0b1a6c', marginBottom: '10px', fontSize: '28px', fontWeight: '800' }}>목표 및 개인정보 설정</h2>
      <p style={{ textAlign: 'center', color: '#666', marginBottom: '15px' }}>아래 질문지를 작성해주시면, AI가 완벽하게 최적화된 학습 스케줄을 즉시 짜드립니다.</p>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '40px' }}>
        <div style={{ flex: 1, height: '1px', background: '#eee', maxWidth: '100px' }}></div>
        <span style={{ margin: '0 15px', color: '#82d7ff' }}>💙</span>
        <div style={{ flex: 1, height: '1px', background: '#eee', maxWidth: '100px' }}></div>
      </div>
 
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
        
        {/* 1. Who */}
        <div style={{ background: '#f4f9ff', padding: '30px', borderRadius: '20px', border: '2px solid #d6e8ff' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#0b1a6c', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#4285f4', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>👤</span>
            1. 이용자(학생) 정보 (Who)
          </h3>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#555' }}>연령 / 직업 (필수)</label>
              <input type="text" placeholder="예: 중학교 2학년, 직장인, 취준생" value={ageGroup} onChange={e => setAgeGroup(e.target.value)} style={inputStyle} required />
            </div>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#555' }}>현재 실력 수준</label>
              <input type="text" placeholder="예: 기초 부족, 토익 600점 수준" value={currentLevel} onChange={e => setCurrentLevel(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#555' }}>관리 방식 선택 (필수)</label>
            <div style={{ display: 'flex', gap: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '15px', color: '#555', fontWeight: 'bold' }}>
                <input type="radio" name="managementType" value="독학형" checked={managementType === '독학형'} onChange={e => setManagementType(e.target.value)} style={{ width: '18px', height: '18px' }} />
                🎒 독학형 (스스로 학습 관리)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '15px', color: '#555', fontWeight: 'bold' }}>
                <input type="radio" name="managementType" value="관리형" checked={managementType === '관리형'} onChange={e => setManagementType(e.target.value)} style={{ width: '18px', height: '18px' }} />
                🏫 관리형 (관리자 상담 및 등하원 시간 체크)
              </label>
            </div>
          </div>
        </div>

        {/* 2. What */}
        <div style={{ background: '#f4fff4', padding: '30px', borderRadius: '20px', border: '2px solid #cce8cc' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#1b5e20', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#4caf50', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🎯</span>
            2. 무엇을 공부하나요? (What)
          </h3>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#555' }}>최종 목표 시험 (필수)</label>
              <input type="text" placeholder="예: 2학기 기말고사 국영수 만점, 정보처리기사" value={targetGoal} onChange={e => setTargetGoal(e.target.value)} style={inputStyle} required />
            </div>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#555' }}>교재 및 세부 범위</label>
              <input type="text" placeholder="예: 쎈 수학 1~5단원, 시나공 기본서 전체" value={materials} onChange={e => setMaterials(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </div>

        {/* 3. When & How */}
        <div style={{ background: '#fff9f0', padding: '30px', borderRadius: '20px', border: '2px solid #ffe0b2' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#e65100', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#ff9800', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📅</span>
            3. 일정 및 제약 조건 (When & How)
          </h3>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#555' }}>목표 기한 (D-Day) (필수)</label>
            <input type="text" placeholder="예: 10월 5일까지, 4주 동안" value={targetDate} onChange={e => setTargetDate(e.target.value)} style={inputStyle} required />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '15px', marginBottom: '15px' }}>
              <label style={{ fontWeight: 'bold', color: '#555', margin: 0 }}>요일별 학습 시간 (필수)</label>
              <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>공부하지 않는 날은 0으로 비워두세요.</p>
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', paddingBottom: '10px' }}>
              {daysOfWeek.map(day => (
                <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '10px 15px', background: '#fff', borderRadius: '12px', border: hoursPerDayMap[day] ? '2px solid #ff9800' : '1px solid #ffe0b2', flex: '1 1 80px', minWidth: '80px', justifyContent: 'center' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '15px', color: hoursPerDayMap[day] ? '#e65100' : '#888' }}>{day}</span>
                  <input 
                    type="number" 
                    min="0" 
                    max="24"
                    placeholder="0"
                    value={hoursPerDayMap[day] || ''} 
                    onChange={e => handleHourChange(day, e.target.value)} 
                    style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none', width: '40px', textAlign: 'center', fontSize: '15px', padding: '4px', background: 'transparent', color: '#333' }} 
                  />
                </div>
              ))}
            </div>
          </div>

          {Object.keys(hoursPerDayMap).filter(day => hoursPerDayMap[day] > 0).length > 0 && (
            <div style={{ marginTop: '20px', background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #ffe0b2' }}>
              <h4 style={{ margin: '0 0 15px 0', color: '#e65100', fontSize: '15px' }}>⏰ 요일별 입/퇴실 예약 시간 (통제형 출결용)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Object.keys(hoursPerDayMap).filter(day => hoursPerDayMap[day] > 0).map(day => (
                  <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '15px', fontSize: '14px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 'bold', width: '60px' }}>{day}요일</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>입실 예정:</span>
                      <input 
                        type="time" 
                        value={scheduledTimes[day]?.in || '09:00'} 
                        onChange={e => handleTimeChange(day, 'in', e.target.value)}
                        style={{ padding: '6px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>퇴실 예정:</span>
                      <input 
                        type="time" 
                        value={scheduledTimes[day]?.out || '18:00'} 
                        onChange={e => handleTimeChange(day, 'out', e.target.value)}
                        style={{ padding: '6px', borderRadius: '6px', border: '1px solid #ccc', outline: 'none' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', marginTop: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold', color: '#555' }}>
              <input type="checkbox" checked={wantsBuffer} onChange={e => setWantsBuffer(e.target.checked)} style={{ width: '20px', height: '20px' }} />
              주 1회 예비일(복습/휴식) 포함하기
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
          <button type="button" onClick={() => { if(confirm("기존에 작성 중이던 모든 계획표가 삭제되고 처음부터 다시 시작합니다. 계속하시겠습니까?")) { localStorage.removeItem('selfstudy_session_id'); window.location.reload(); } }} style={{ background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '30px', width: '70px', height: '60px', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}>🔄<br/>초기화</button>
          
          <button 
            type="submit" 
            disabled={loading}
            style={{
              flex: 1,
              background: loading ? '#9e9e9e' : 'linear-gradient(90deg, #1976d2, #0b1a6c)',
              color: '#fff', padding: '18px', border: 'none', borderRadius: '30px',
              fontSize: '18px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 10px 20px rgba(11, 26, 108, 0.3)'
            }}
          >
            {loading ? 'AI가 최적의 진도표를 계산 중입니다...' : '🚀 나만의 진도 계획표 생성하기'}
          </button>
          
          <button type="button" style={{ background: '#bdbdbd', color: '#fff', border: 'none', borderRadius: '30px', width: '60px', height: '60px', fontSize: '14px', cursor: 'pointer', fontWeight: 'bold' }}>공유</button>
        </div>
      </form>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '14px 18px',
  borderRadius: '12px',
  border: '1px solid #e0e0e0',
  outline: 'none',
  fontSize: '15px',
  boxSizing: 'border-box' as const,
  background: '#fff',
  color: '#333',
  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
};
