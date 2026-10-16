// 다운로드 버튼: 별도의 zip 파일을 서버/폴더에서 찾지 않고,
// 클릭하는 순간 브라우저 안에서 zip을 직접 만들어 내려줍니다.
// -> "파일이 없다"는 오류가 나지 않도록 실제 프로그램 파일 내용을 이 스크립트 안에 담아둡니다.

const downloadBtn = document.getElementById('downloadBtn');
const downloadHint = document.getElementById('downloadHint');

const NOSECAST_PY = "import math\nimport platform\nimport threading\nimport time\nimport warnings\nimport cv2\nimport mediapipe as mp\nimport pyautogui\nimport pyperclip\nimport speech_recognition as sr\n\nwarnings.filterwarnings('ignore')\n\n# PyAutoGUI 설정\npyautogui.FAILSAFE = False\npyautogui.PAUSE = 0\n\nscreen_w, screen_h = pyautogui.size()\n\n# MediaPipe Face Mesh 초기화\nmp_face_mesh = mp.solutions.face_mesh\nface_mesh = mp_face_mesh.FaceMesh(\n    max_num_faces=1,\n    refine_landmarks=True,\n    min_detection_confidence=0.5,\n    min_tracking_confidence=0.5,\n)\n\ncap = cv2.VideoCapture(0)\ncap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)\ncap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)\n\nprev_x, prev_y = screen_w // 2, screen_h // 2\nsmooth_factor = 0.25  # 커서 이동 부드러움 정도 (0.1 ~ 0.5)\n\n# --- 클릭/드래그 상태 변수 ---\nis_pressed = False\nblink_frames = 0\nBLINK_THRESHOLD = 3\n\n# --- 음성 스크롤 변수 ---\nSCROLL_STEP = 600           # \"스크롤 업/다운\" 한 번에 스크롤되는 양\nlast_scroll_action = ''\nlast_scroll_action_time = 0.0\nSCROLL_DISPLAY_DURATION = 1.2  # 화면에 상태 문구를 보여줄 시간(초)\n\n# --- 캘리브레이션 변수 ---\nis_calibrated = False\ncalibration_start_time = time.time()\ncalib_nose_x_list = []\ncalib_nose_y_list = []\n\nrange_x = 0.05\nrange_y = 0.025\n\nmin_x, max_x = 0.0, 1.0\nmin_y, max_y = 0.0, 1.0\n\n# --- 음성 인식 설정 ---\nrecognizer = sr.Recognizer()\nlast_spoken_text = ''\nis_listening_active = True\n\n# OS 확인 (macOS는 command+v, Windows/Linux는 ctrl+v)\nPASTE_KEY = 'command' if platform.system() == 'Darwin' else 'ctrl'\n\n\ndef listen_voice_background():\n  \"\"\"웹 입력창에 한글이 깨지지 않고 들어가도록 클립보드 붙여넣기 방식 적용.\n  단, '스크롤 업' / '스크롤 다운'이라고 말하면 텍스트를 붙여넣는 대신 스크롤을 실행함.\"\"\"\n  global last_spoken_text, is_listening_active\n  global last_scroll_action, last_scroll_action_time\n\n  with sr.Microphone() as source:\n    recognizer.adjust_for_ambient_noise(source, duration=1)\n    print('마이크 준비 완료! 웹 브라우저 입력창을 클릭하고 말씀하세요.')\n\n    while is_listening_active:\n      try:\n        audio = recognizer.listen(source, timeout=3, phrase_time_limit=5)\n        text = recognizer.recognize_google(audio, language='ko-KR')\n\n        if text:\n          print(f'[인식된 텍스트]: {text}')\n          last_spoken_text = text\n\n          if '스크롤' in text and any(k in text for k in ['다운', '아래', '밑']):\n            # 스크롤 다운 명령\n            pyautogui.scroll(-SCROLL_STEP)\n            last_scroll_action = 'SCROLL DOWN (voice)'\n            last_scroll_action_time = time.time()\n\n          elif '스크롤' in text and any(k in text for k in ['업', '위']):\n            # 스크롤 업 명령\n            pyautogui.scroll(SCROLL_STEP)\n            last_scroll_action = 'SCROLL UP (voice)'\n            last_scroll_action_time = time.time()\n\n          else:\n            # 일반 텍스트: 클립보드 복사 후 붙여넣기\n            pyperclip.copy(text + ' ')\n            pyautogui.hotkey(PASTE_KEY, 'v')\n\n      except sr.WaitTimeoutError:\n        pass\n      except sr.UnknownValueError:\n        pass\n      except sr.RequestError as e:\n        print(f'API 오류: {e}')\n      except Exception:\n        pass\n\n\n# 음성 인식 전용 데몬 스레드 시작\nvoice_thread = threading.Thread(target=listen_voice_background, daemon=True)\nvoice_thread.start()\n\nprint(\n    '프로그램 시작: 3초 동안 화면 중앙을 정면으로 응시해주세요 (자동'\n    ' 캘리브레이션)'\n)\n\n\ndef get_distance(p1, p2):\n  return math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)\n\n\nwhile cap.isOpened():\n  success, frame = cap.read()\n  if not success:\n    break\n\n  frame = cv2.flip(frame, 1)\n  h, w, _ = frame.shape\n\n  rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)\n  results = face_mesh.process(rgb_frame)\n\n  if results.multi_face_landmarks:\n    for face_landmarks in results.multi_face_landmarks:\n      landmarks = face_landmarks.landmark\n      nose = landmarks[1]\n\n      # --- [1] 자동 캘리브레이션 ---\n      if not is_calibrated:\n        elapsed = time.time() - calibration_start_time\n        calib_nose_x_list.append(nose.x)\n        calib_nose_y_list.append(nose.y)\n\n        cv2.putText(\n            frame,\n            f'Calibrating... {int(3 - elapsed) + 1}s (Look at Center)',\n            (30, 50),\n            cv2.FONT_HERSHEY_SIMPLEX,\n            0.8,\n            (0, 0, 255),\n            2,\n        )\n\n        if elapsed > 3.0:\n          center_x = sum(calib_nose_x_list) / len(calib_nose_x_list)\n          center_y = sum(calib_nose_y_list) / len(calib_nose_y_list)\n\n          min_x, max_x = center_x - range_x, center_x + range_x\n          min_y, max_y = center_y - range_y, center_y + range_y\n\n          is_calibrated = True\n          print('캘리브레이션 완료!')\n        continue\n\n      # --- [2] 마우스 커서 이동 ---\n      target_x = (nose.x - min_x) / (max_x - min_x + 1e-6)\n      target_y = (nose.y - min_y) / (max_y - min_y + 1e-6)\n\n      target_x = max(0.0, min(1.0, target_x))\n      target_y = max(0.0, min(1.0, target_y))\n\n      mouse_x = int(target_x * screen_w)\n      mouse_y = int(target_y * screen_h)\n\n      curr_x = int(prev_x + (mouse_x - prev_x) * smooth_factor)\n      curr_y = int(prev_y + (mouse_y - prev_y) * smooth_factor)\n\n      if is_pressed or abs(curr_x - prev_x) > 2 or abs(curr_y - prev_y) > 2:\n        pyautogui.moveTo(curr_x, curr_y)\n        prev_x, prev_y = curr_x, curr_y\n\n      # --- [3] 음성 스크롤 상태 표시 (실제 스크롤은 음성 인식 스레드에서 실행됨) ---\n      if last_scroll_action and time.time() - last_scroll_action_time < SCROLL_DISPLAY_DURATION:\n        cv2.putText(\n            frame,\n            last_scroll_action,\n            (50, 140),\n            cv2.FONT_HERSHEY_SIMPLEX,\n            0.7,\n            (255, 128, 0),\n            2,\n        )\n\n      # --- [4] 눈 감기 감지 ---\n      vertical_dist = get_distance(landmarks[159], landmarks[145])\n      horizontal_dist = get_distance(landmarks[33], landmarks[133])\n      ear = vertical_dist / (horizontal_dist + 1e-6)\n\n      if ear < 0.16:\n        blink_frames += 1\n        if blink_frames >= BLINK_THRESHOLD and not is_pressed:\n          pyautogui.mouseDown()\n          is_pressed = True\n      else:\n        if is_pressed:\n          pyautogui.mouseUp()\n          is_pressed = False\n        blink_frames = 0\n\n      # 화면 상태 및 음성 텍스트 표시\n      if is_pressed:\n        cv2.putText(\n            frame,\n            'DRAGGING...',\n            (50, 100),\n            cv2.FONT_HERSHEY_SIMPLEX,\n            1.0,\n            (0, 0, 255),\n            3,\n        )\n\n      if last_spoken_text:\n        cv2.putText(\n            frame,\n            f'Voice: {last_spoken_text}',\n            (30, h - 30),\n            cv2.FONT_HERSHEY_SIMPLEX,\n            0.6,\n            (255, 255, 0),\n            2,\n        )\n\n      nose_cx, nose_cy = int(nose.x * w), int(nose.y * h)\n      cv2.circle(frame, (nose_cx, nose_cy), 5, (0, 255, 0), -1)\n\n  else:\n    if is_pressed:\n      pyautogui.mouseUp()\n      is_pressed = False\n\n  cv2.imshow('Head Pose Control Mouse', frame)\n\n  key = cv2.waitKey(1) & 0xFF\n  if key == ord('q') or key == 27:\n    break\n\nis_listening_active = False\nif is_pressed:\n  pyautogui.mouseUp()\n\ncap.release()\ncv2.destroyAllWindows()\n";

const NOSECAST_BAT = "@echo off\r\ncd /d \"%~dp0\"\r\n\r\npy -3.11 --version >nul 2>&1\r\nif %errorlevel%==0 (\r\n    py -3.11 nosecast.py\r\n    goto end\r\n)\r\n\r\npy -3.10 --version >nul 2>&1\r\nif %errorlevel%==0 (\r\n    py -3.10 nosecast.py\r\n    goto end\r\n)\r\n\r\necho Python 3.10 또는 3.11을 찾을 수 없습니다. 설치되어 있는지 확인해주세요.\r\n\r\n:end\r\npause\r\n";

const REQUIREMENTS_TXT = "opencv-python\nmediapipe\npyautogui\npyperclip\nSpeechRecognition\nPyAudio\n";

const README_TXT = "Eye Scroll 실행 방법\n\n1) 이 폴더에서 터미널(명령 프롬프트)을 열고 아래 명령어로 필요한 패키지를 설치하세요.\n   pip install -r requirements.txt\n\n   * 마이크 음성 인식을 쓰려면 PyAudio 설치가 필요해요.\n     설치가 안 되면 아래처럼 시도해보세요.\n     - Windows: pip install pipwin  ->  pipwin install pyaudio\n     - macOS:   brew install portaudio  ->  pip install pyaudio\n\n2) 프로그램을 실행하세요.\n   - Windows: nosecast_실행.bat 파일을 더블클릭 (Python 3.11 또는 3.10을 자동으로 찾아 실행해요)\n   - 또는 터미널에서: python nosecast.py\n\n3) 실행 후 3초간 화면 중앙을 정면으로 바라보면 자동으로 캘리브레이션됩니다.\n   - 고개(코 위치) 움직임으로 마우스 커서가 이동해요.\n   - 눈을 잠깐 감으면 클릭/드래그가 시작되고, 뜨면 놓여요.\n   - 마이크에 \"스크롤 업\" / \"스크롤 다운\"이라고 말하면 화면이 스크롤돼요.\n   - 그 외의 말은 인식된 문장이 현재 포커스된 입력창에 자동으로 붙여넣기 돼요.\n   - q 또는 Esc 키를 누르면 종료됩니다.\n";

downloadBtn.addEventListener('click', async () => {
    downloadBtn.disabled = true;
    downloadBtn.textContent = '압축 파일 만드는 중...';

    try {
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip 로드 실패');
        }

        const zip = new JSZip();
        zip.file('nosecast.py', NOSECAST_PY);
        zip.file('nosecast_실행.bat', NOSECAST_BAT);
        zip.file('requirements.txt', REQUIREMENTS_TXT);
        zip.file('README.txt', README_TXT);

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'eyescroll_installer.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 5000);

        downloadHint.textContent = '다운로드 완료! 압축을 풀고 README.txt를 확인해주세요.';
    } catch (err) {
        downloadHint.textContent = '다운로드 중 문제가 생겼어요. 네트워크 상태를 확인한 뒤 새로고침 후 다시 시도해주세요.';
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = '다운로드';
    }
});
