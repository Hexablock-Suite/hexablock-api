import { GetProgressUseCase } from '../../../src/application/progress/get-progress.use-case.js';
import { GameId } from '../../../src/domain/progress/game-id.js';
import { PlayerProgress } from '../../../src/domain/progress/player-progress.js';
import { UserId } from '../../../src/domain/user/user-id.js';
import { InMemoryProgressRepository } from '../../support/in-memory-progress-repository.js';
import { testUserId } from '../../support/user-ids.js';

const ADA = UserId.from(testUserId(1));
const GRACE = UserId.from(testUserId(2));
const AT = new Date('2026-11-06T10:00:00.000Z');

describe('GetProgressUseCase (API-FR-02)', () => {
  let progress: InMemoryProgressRepository;
  let getProgress: GetProgressUseCase;

  beforeEach(() => {
    progress = new InMemoryProgressRepository();
    getProgress = new GetProgressUseCase(progress);
  });

  it('should_return_stored_progress_when_user_has_progress_for_game', async () => {
    const stored = PlayerProgress.start(ADA, GameId.of('hexa-lines'), AT);
    await progress.save(stored);

    const result = await getProgress.execute({ userId: ADA, gameId: GameId.of('hexa-lines') });

    expect(result).toEqual({ ok: true, value: stored });
  });

  it('should_fail_with_progress_not_found_when_only_another_user_has_progress_for_game', async () => {
    await progress.save(PlayerProgress.start(GRACE, GameId.of('hexa-lines'), AT));

    const result = await getProgress.execute({ userId: ADA, gameId: GameId.of('hexa-lines') });

    expect(result).toEqual({ ok: false, error: { kind: 'progress-not-found' } });
  });
});
