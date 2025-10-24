# WebGL Blur

WebGL과 MediaPipe를 사용한 실시간 배경 블러 애플리케이션입니다.

## 기능

- 실시간 웹캠 비디오 스트림 캡처
- MediaPipe Image Segmenter를 사용한 인물 분할
- WebGL 셰이더를 통한 고성능 마스크 처리
- 실시간 배경 블러 효과 적용

## 기술 스택

- **React 18** - UI 프레임워크
- **TypeScript** - 타입 안전성
- **Vite** - 빌드 도구
- **MediaPipe** - AI 기반 이미지 세그멘테이션
- **WebGL2** - GPU 가속 렌더링
- **Canvas API** - 이미지 처리

## 설치 및 실행

### 필수 요구사항

- Node.js 18 이상
- pnpm (권장) 또는 npm

### 설치

```bash
# 의존성 설치
pnpm install
```

### 개발 서버 실행

```bash
# 개발 서버 시작
pnpm dev
```

브라우저에서 `https://localhost:5173`으로 접속하세요.

### 빌드

```bash
# 프로덕션 빌드
pnpm build
```

### 미리보기

```bash
# 빌드된 앱 미리보기
pnpm preview
```

## 프로젝트 구조

```
src/
├── App.tsx              # 메인 React 컴포넌트
├── processor.ts         # MediaPipe 및 WebGL 처리 로직
├── shader.utils.ts      # WebGL 셰이더 유틸리티
├── main.tsx            # 애플리케이션 진입점
└── index.css           # 스타일시트
```

## 주요 컴포넌트

### App.tsx

- 웹캠 스트림 캡처 및 처리된 비디오 표시
- 원본 비디오와 블러 처리된 비디오를 동시에 렌더링

### Processor 클래스

- MediaPipe Image Segmenter 초기화
- 실시간 프레임 처리 및 세그멘테이션
- WebGL을 통한 마스크 처리
- Canvas를 통한 배경 블러 효과 적용

### Shader Utils

- WebGL2 셰이더 프로그램 생성
- 텍스처 복사 및 변환 유틸리티
- GPU 가속 마스크 처리

## 설정

### 블러 강도 조정

`processor.ts` 파일에서 `BLUR_RADIUS` 상수를 수정하여 블러 강도를 조정할 수 있습니다:

```typescript
const BLUR_RADIUS = 10; // 픽셀 단위
```

### 프레임 레이트 조정

`FRAME_RATE` 상수를 수정하여 처리 프레임 레이트를 조정할 수 있습니다:

```typescript
const FRAME_RATE = 30; // FPS
```

## 브라우저 호환성

- Chrome 88+
- Firefox 89+
- Safari 15+
- Edge 88+

WebGL2와 MediaPipe를 지원하는 최신 브라우저가 필요합니다.

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.
