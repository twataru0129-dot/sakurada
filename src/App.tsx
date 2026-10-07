import { useEffect } from 'react';
import { AppProvider, useApp } from './state/AppContext';
import { navigate, useRoute } from './state/router';
import { Header, IdleWarning } from './ui/common';
import { Entry } from './screens/Entry';
import { Login } from './screens/Login';
import { Home } from './screens/Home';
import { TypingSetup } from './screens/TypingSetup';
import { Practice } from './screens/Practice';
import { Result } from './screens/Result';
import { MyHistory } from './screens/MyHistory';
import { TeacherHome } from './screens/teacher/TeacherHome';
import { StudentDetail } from './screens/teacher/StudentDetail';
import { ExamSelect } from './screens/exam/ExamSelect';
import { ExamPractice } from './screens/exam/ExamPractice';
import { ExamResult } from './screens/exam/ExamResult';
import { ExamManage } from './screens/exam/ExamManage';
import { GameSelect } from './screens/game/GameSelect';
import { SakuradaIntro } from './screens/game/SakuradaIntro';
import { SakuradaPlay } from './screens/game/SakuradaPlay';
import { SakuradaResult } from './screens/game/SakuradaResult';
import { GardenScreen } from './screens/garden/GardenScreen';
import { GardenProvider } from './state/GardenContext';

function Screens() {
  const path = useRoute();
  const { account } = useApp();
  const needsAccount = !['/', '/login'].includes(path);

  // ゲスト・ログインのどちらも選んでいないときは入口へ
  useEffect(() => {
    if (needsAccount && !account) navigate('/');
  }, [needsAccount, account]);

  if (needsAccount && !account) return null;
  const practicing = path === '/practice' || path === '/exam/practice' || path === '/game/sakurada/play' || path === '/game/garden/play';
  let screen;
  if (path === '/') screen = <Entry />;
  else if (path === '/login') screen = <Login />;
  else if (path === '/home') screen = <Home />;
  else if (path === '/typing') screen = <TypingSetup />;
  else if (path === '/practice') screen = <Practice />;
  else if (path === '/result') screen = <Result />;
  else if (path === '/history') screen = <MyHistory />;
  else if (path === '/exam') screen = <ExamSelect />;
  else if (path === '/exam/practice') screen = <ExamPractice />;
  else if (path === '/exam/result') screen = <ExamResult />;
  else if (path === '/exam/manage') screen = <ExamManage />;
  else if (path === '/game') screen = <GameSelect />;
  else if (path === '/game/sakurada') screen = <SakuradaIntro />;
  else if (path === '/game/sakurada/play') screen = <SakuradaPlay />;
  else if (path === '/game/sakurada/result') screen = <SakuradaResult />;
  // 庭と練習は同じ画面です（練習を始めても、庭の表示はそのまま残ります）
  else if (path === '/game/garden' || path === '/game/garden/play') screen = <GardenScreen key="garden" mode={path === '/game/garden/play' ? 'play' : 'garden'} />;
  else if (path === '/teacher') screen = <TeacherHome tab="classes" />;
  else if (path === '/teacher/materials') screen = <TeacherHome tab="materials" />;
  else if (path === '/teacher/account') screen = <TeacherHome tab="account" />;
  else if (path.startsWith('/teacher/student/')) screen = <StudentDetail studentId={path.slice('/teacher/student/'.length)} />;
  else screen = <Home />;
  return (
    <>
      <Header practicing={practicing} />
      {screen}
      <IdleWarning />
    </>
  );
}

export function App() {
  return (
    <AppProvider>
      <GardenProvider>
        <Screens />
      </GardenProvider>
    </AppProvider>
  );
}
