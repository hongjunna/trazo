// src/components/RoutingHelpDialog.jsx
import { SPORTS } from '../sports';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import Icon from './ui/Icon';

const RoutingHelpDialog = ({ open, onClose, sport }) => {
    const current = SPORTS[sport];
    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={`${current.label} 코스 만드는 법`}
            footer={<Button variant="primary" onClick={onClose} data-autofocus>확인</Button>}
            initialFocus="dialog"
        >
            <div className="help-block">
                <h3><Icon name="route" size={16} />{current.label} 길 따라 연결</h3>
                <p>점과 점 사이를 <b>{current.label}에 맞는 길로 자동 연결</b>해요. {current.tagline}.</p>
                <ul>
                    {current.routeOptions.map(option => (
                        <li key={option.id}><b>{option.label}</b> — {option.desc}</li>
                    ))}
                </ul>
            </div>
            <div className="help-block">
                <h3><Icon name="straight" size={16} />직선 연결</h3>
                <p>
                    길을 찾지 않고 점과 점을 곧게 이어요.{' '}
                    {sport === 'run' ? '운동장 트랙, 지도에 없는 공원 안 샛길, 해변 등에 쓰세요.' : '지도에 없는 샛길이나 공사로 바뀐 길에 쓰세요.'}
                    {' '}직선 연결에서도 고도는 지형 데이터로 계산해요.
                </p>
            </div>
            <div className="help-block">
                <h3><Icon name="sliders" size={16} />편집 도구</h3>
                <ul>
                    <li><b>코스 고치기</b> — 찍은 점이나 길을 잡고 끌어 옮기면 그 부분의 길을 다시 찾아요. 휴대폰에서는 꾹 누른 뒤 끌어요.</li>
                    <li><b>출발점으로 복귀</b> — 마지막 점에서 출발점까지 길을 찾아 순환 코스를 만들어요.</li>
                    <li><b>왕복 코스</b> — 지금까지의 길을 그대로 되돌아와요.</li>
                    <li><b>되돌리기·다시 실행</b> — 지도 오른쪽 버튼이나 <span className="kbd">Ctrl</span>+<span className="kbd">Z</span>, <span className="kbd">Ctrl</span>+<span className="kbd">Shift</span>+<span className="kbd">Z</span></li>
                    <li><b>웨이포인트</b> — 경로 위를 누르면(휴대폰은 꾹 눌렀다 끌지 않고 떼면, 데스크톱은 우클릭 메뉴도 가능) 정상·급수·위험·회전 같은 지점을 표시해요. 표시한 지점을 누르면 고치거나 지울 수 있고, 고도 차트에도 아이콘과 이름이 나와요.</li>
                    <li><b>고도 차트</b> — 차트 위를 훑으면 지도에, 지도의 코스 근처에 마우스를 올리면 차트에 해당 위치가 표시돼요. 휠·두 손가락으로 확대할 수 있어요.</li>
                </ul>
            </div>
            <div className="help-block">
                <h3><Icon name="file" size={16} />파일 내려받기 · 불러오기</h3>
                <ul>
                    <li><b>파일</b> — GPX·FIT·TCX·KML·GeoJSON으로 내려받아요. 웨이포인트는 가민·와후 등 기기에서 코스 포인트로 표시돼요.</li>
                    <li><b>이미지</b> — 코스 지도·고도 그래프·웨이포인트를 A5·A4·A3 크기 PNG로 저장해요.</li>
                    <li><b>파일 불러오기</b> — 가진 GPX·TCX·FIT·KML·GeoJSON 파일을 불러와 고치거나 저장·공유해요. 지도에 파일을 끌어다 놓아도 돼요.</li>
                </ul>
            </div>
        </Dialog>
    );
};

export default RoutingHelpDialog;
