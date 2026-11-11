// src/components/AiReadScope.jsx
// AI 서비스가 MCP로 읽을 수 있는 정보와 없는 정보. 연동센터와 로그인 동의 화면(/oauth/authorize)에서 함께 씁니다.
import Icon from './ui/Icon';

const AiReadScope = () => (
    <ul className="ai-scope">
        <li><Icon name="check" size={16} /> 내 코스 전체 (비공개·부분 공개 포함): 이름, 설명, 경로 좌표, 거리·고도, 웨이포인트, 폴더 이름</li>
        <li><Icon name="check" size={16} /> 다른 사람이 전체 공개한 코스, 그리고 공유 링크를 받은 코스</li>
        <li><Icon name="check" size={16} /> 코스가 지나는 지역 이름(예: 영등포구 여의도동)과 출발·도착 좌표</li>
        <li className="ai-scope__no"><Icon name="x" size={16} /> 코스를 만들거나 고치거나 지울 수 없습니다 (읽기 전용)</li>
        <li className="ai-scope__no"><Icon name="x" size={16} /> 이메일, 좋아요·댓글 기록, 다른 사람의 비공개 코스는 읽을 수 없습니다</li>
    </ul>
);

export default AiReadScope;
