// Node 테스트 러너가 파일별 프로세스 통신 중 드물게
// "Unable to deserialize cloned data" 오류로 실패하는 문제를 피하기 위해,
// 지원되는 Node에서는 모든 테스트를 한 프로세스에서 실행한다.
import { spawnSync } from 'node:child_process';
const supports = flag => spawnSync(process.execPath, [flag, '-e', '0'], { stdio: 'ignore' }).status === 0;
const isolation = ['--test-isolation=none', '--experimental-test-isolation=none'].find(supports);
const result = spawnSync(process.execPath, ['--test', ...(isolation ? [isolation] : [])], { stdio: 'inherit' });
process.exit(result.status ?? 1);
