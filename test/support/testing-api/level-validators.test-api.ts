import { FitLevelValidator } from '../../../src/domain/level/fit/fit-level-validator.js';
import { HexTopology } from '../../../src/domain/level/hex-topology.js';
import { LevelDefinition } from '../../../src/domain/level/level-definition.js';
import { LevelOrder } from '../../../src/domain/level/level-order.js';
import type { LevelProblem } from '../../../src/domain/level/level-problem.js';
import type { LevelSection } from '../../../src/domain/level/level-section.js';
import type { LevelValidator } from '../../../src/domain/level/level-validator.js';
import {
  type LevelValidatorEntry,
  LevelValidators,
} from '../../../src/domain/level/level-validators.js';
import { LevelVersion } from '../../../src/domain/level/level-version.js';
import { SortLevelValidator } from '../../../src/domain/level/sort/sort-level-validator.js';
import { Topologies } from '../../../src/domain/level/topologies.js';
import { TopologyId } from '../../../src/domain/level/topology-id.js';
import { GameId } from '../../../src/domain/shared/game-id.js';
import { LevelId } from '../../../src/domain/shared/level-id.js';
import { err, ok, type Result } from '../../../src/domain/shared/result.js';
import { levelExample, testSection, valueOf } from '../level-format.js';
import { WhenOutcome } from './when-outcome.js';

// Test double for a strategy. It keeps each call and answers with a fixed result.
class RecordingValidator implements LevelValidator<LevelSection> {
  readonly calls: [unknown, TopologyId][] = [];

  constructor(private readonly answer: Result<LevelSection, LevelProblem>) {}

  sectionOf(raw: unknown, topology: TopologyId): Result<LevelSection, LevelProblem> {
    this.calls.push([raw, topology]);
    return this.answer;
  }
}

const LEVEL_01 = valueOf(LevelId.of('level-01'));
const FIRST = valueOf(LevelOrder.of(1));
const V1 = valueOf(LevelVersion.of(1));
const HEX = valueOf(TopologyId.of('hex'));
const RAW_SECTION = { any: 'section' };

type Checked = Result<LevelDefinition, LevelProblem>;

// Testing API of the domain service LevelValidators (decision 5). The given
// steps register a strategy per game, the when steps build the registry and
// check one level, and the then steps check the answer and the calls of the
// strategies. The service is synchronous, but its when steps are async and
// return the Testing API, as the when steps of the use cases do (#254). A
// level of a when step is level-01, order 1, version 1, on the hex topology,
// with a raw section. A then step fails when no when step ran.
export class LevelValidatorsTestApi {
  private readonly entries: LevelValidatorEntry[] = [];
  private readonly strategies = new Map<string, RecordingValidator>();
  private readonly built = new WhenOutcome<LevelValidators>();
  private readonly checked = new WhenOutcome<Checked>();

  // A strategy that builds a test section for every level of the game.
  givenAStrategyFor(gameId: string): this {
    return this.register(gameId, new RecordingValidator(ok(testSection(gameId))));
  }

  givenAStrategyThatRejectsTheSectionOf(gameId: string, problem: LevelProblem): this {
    return this.register(gameId, new RecordingValidator(err(problem)));
  }

  // The real strategies: Fit on the hex topology, and Sort.
  givenTheFitAndTheSortStrategies(): this {
    this.entries.push(
      [
        valueOf(GameId.of('hexa-fit')),
        new FitLevelValidator(Topologies.of([[HEX, new HexTopology()]])),
      ],
      [valueOf(GameId.of('hexa-sort')), new SortLevelValidator()],
    );
    return this;
  }

  async whenBuildingTheRegistry(): Promise<this> {
    await this.built.record(() => Promise.resolve(LevelValidators.of(this.entries)));
    return this;
  }

  // Checks level-01 of the game. The when step builds the GameId again, so
  // the registry finds the strategy by value.
  async whenCheckingALevelOf(gameId: string): Promise<this> {
    await this.checked.record(() =>
      Promise.resolve(
        LevelValidators.of(this.entries).check(
          valueOf(GameId.of(gameId)),
          LEVEL_01,
          FIRST,
          V1,
          HEX,
          RAW_SECTION,
        ),
      ),
    );
    return this;
  }

  // Checks the complete example of the game in the format document, as the
  // border hands it over: the common part as domain values and the section
  // as it arrives.
  async whenCheckingTheExampleOf(gameId: 'hexa-fit' | 'hexa-sort'): Promise<this> {
    const json = levelExample(gameId);
    await this.checked.record(() =>
      Promise.resolve(
        LevelValidators.of(this.entries).check(
          valueOf(GameId.of(json.gameId)),
          valueOf(LevelId.of(json.levelId)),
          valueOf(LevelOrder.of(json.order)),
          valueOf(LevelVersion.of(json.version)),
          valueOf(TopologyId.of(json.topology)),
          json.section,
        ),
      ),
    );
    return this;
  }

  thenTheCheckSucceeds(): void {
    expect(this.checked.value().ok).toBe(true);
  }

  // The check gives level-01 of the game.
  thenTheCheckGivesTheLevelOf(gameId: string): void {
    const level = this.checked.value();
    const expected = LevelDefinition.of(
      valueOf(GameId.of(gameId)),
      LEVEL_01,
      FIRST,
      V1,
      HEX,
      ok(testSection('any')),
    );
    expect(valueOf(level).equals(valueOf(expected))).toBe(true);
  }

  thenTheCheckFailsWith(problem: LevelProblem): void {
    expect(this.checked.value()).toEqual({ ok: false, error: problem });
  }

  // The strategy of the game got the raw section and the topology once.
  thenTheStrategyOfGotTheSectionOnce(gameId: string): void {
    this.checked.ran();
    expect(this.strategyOf(gameId).calls).toEqual([[RAW_SECTION, HEX]]);
  }

  thenTheStrategyOfWasAskedOnce(gameId: string): void {
    this.checked.ran();
    expect(this.strategyOf(gameId).calls).toHaveLength(1);
  }

  thenTheStrategyOfWasNotAsked(gameId: string): void {
    this.checked.ran();
    expect(this.strategyOf(gameId).calls).toEqual([]);
  }

  thenTheRegistryIsRefusedWith(error: Error): void {
    const rejection = this.built.rejection();
    expect(() => {
      throw rejection;
    }).toThrow(error);
  }

  private register(gameId: string, strategy: RecordingValidator): this {
    this.entries.push([valueOf(GameId.of(gameId)), strategy]);
    this.strategies.set(gameId, strategy);
    return this;
  }

  private strategyOf(gameId: string): RecordingValidator {
    const strategy = this.strategies.get(gameId);
    if (strategy === undefined) {
      throw new Error(`No given step registers a strategy for ${gameId}.`);
    }
    return strategy;
  }
}
