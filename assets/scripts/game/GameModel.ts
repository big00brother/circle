import {
  CELL_COUNT,
  CellState,
  Piece,
  PlacementResult,
  Ring,
  RingColor,
  RING_COLORS,
  RingSize,
  RING_SIZES,
} from './GameTypes';

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const COLOR_UNLOCK_ORDER: RingColor[] = ['red', 'yellow', 'green', 'blue', 'orange', 'pink', 'purple'];
const START_COLOR_COUNT = 4;
const CLEARS_PER_COLOR_UNLOCK = 3;
const AVOID_IMMEDIATE_CLEAR_AFTER = 2;

interface SimulatedPlacement {
  board: CellState[];
  clearedRings: number;
}

interface CandidateRank {
  piece: Piece;
  score: number;
}

export class GameModel {
  public board: CellState[] = [];
  public hand: Array<Piece | null> = [null, null, null];
  public score = 0;
  public gameOver = false;
  public clearCount = 0;

  private nextPieceId = 1;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.board = this.createEmptyBoard();
    this.hand = [null, null, null];
    this.score = 0;
    this.gameOver = false;
    this.clearCount = 0;
    this.nextPieceId = 1;
    this.dealNextHand();
  }

  public canPlacePiece(piece: Piece, cellIndex: number, board: CellState[] = this.board): boolean {
    if (!piece || cellIndex < 0 || cellIndex >= CELL_COUNT) {
      return false;
    }

    const cell = board[cellIndex];
    return piece.rings.every((ring) => cell[ring.size] === null);
  }

  public canCommitPieceToCell(pieceIndex: number, cellIndex: number): boolean {
    const piece = this.hand[pieceIndex];
    return !!piece && this.canPlacePiece(piece, cellIndex);
  }

  public placePiece(pieceIndex: number, cellIndex: number): PlacementResult {
    const piece = this.hand[pieceIndex];
    if (!piece) {
      return this.rejectedPlacement('empty-hand-slot');
    }

    if (!this.canCommitPieceToCell(pieceIndex, cellIndex)) {
      return this.rejectedPlacement('invalid-placement');
    }

    const preview = this.simulatePlacement(piece, cellIndex, this.board);
    this.board = preview.board;
    this.hand[pieceIndex] = null;

    const scoreDelta = piece.rings.length + preview.clearedRings * 10;
    this.score += scoreDelta;
    if (preview.clearedRings > 0) {
      this.clearCount += 1;
    }

    if (this.hand.every((handPiece) => handPiece === null)) {
      this.dealNextHand();
    } else if (!this.hasPlayableHandMove()) {
      this.gameOver = true;
    }

    return {
      placed: true,
      scoreDelta,
      clearedRings: preview.clearedRings,
      gameOver: this.gameOver,
    };
  }

  public hasAnyPlacement(piece: Piece, board: CellState[] = this.board): boolean {
    for (let cellIndex = 0; cellIndex < CELL_COUNT; cellIndex += 1) {
      if (this.canPlacePiece(piece, cellIndex, board)) {
        return true;
      }
    }

    return false;
  }

  public getValidCellsForPiece(piece: Piece): number[] {
    const cells: number[] = [];
    for (let cellIndex = 0; cellIndex < CELL_COUNT; cellIndex += 1) {
      if (this.canPlacePiece(piece, cellIndex)) {
        cells.push(cellIndex);
      }
    }

    return cells;
  }

  public isEveryCellOccupied(board: CellState[] = this.board): boolean {
    return board.every((cell) => cell.some((ring) => ring !== null));
  }

  private rejectedPlacement(reason: string): PlacementResult {
    return {
      placed: false,
      scoreDelta: 0,
      clearedRings: 0,
      gameOver: this.gameOver,
      reason,
    };
  }

  private dealNextHand(): void {
    const nextHand = this.findPlayableBatch(this.board);
    if (!nextHand) {
      this.hand = [null, null, null];
      this.gameOver = true;
      return;
    }

    this.hand = nextHand;
  }

  private hasPlayableHandMove(): boolean {
    for (let pieceIndex = 0; pieceIndex < this.hand.length; pieceIndex += 1) {
      const piece = this.hand[pieceIndex];
      if (!piece) {
        continue;
      }

      for (let cellIndex = 0; cellIndex < CELL_COUNT; cellIndex += 1) {
        if (this.canCommitPieceToCell(pieceIndex, cellIndex)) {
          return true;
        }
      }
    }

    return false;
  }

  private findPlayableBatch(board: CellState[]): Array<Piece | null> | null {
    let path = this.searchBatch(board, 3, false);
    if (!path) {
      path = this.searchBatch(board, 3, true);
    }

    if (!path) {
      return null;
    }

    return path.map((piece) => ({
      id: this.nextPieceId++,
      rings: piece.rings.map((ring) => ({ ...ring })),
    }));
  }

  private searchBatch(board: CellState[], remainingCount: number, allowSameColorDouble: boolean): Piece[] | null {
    if (remainingCount === 0) {
      return [];
    }

    const candidates = this.rankCandidates(this.enumerateLegalCandidates(board, allowSameColorDouble), board)
      .slice(0, this.isEveryCellOccupied(board) ? 60 : 42);

    for (const ranked of candidates) {
      const piece = ranked.piece;
      const placements = this.getRankedPlacements(piece, board);
      for (const cellIndex of placements) {
        const preview = this.simulatePlacement(piece, cellIndex, board);
        const rest = this.searchBatch(preview.board, remainingCount - 1, allowSameColorDouble);
        if (rest) {
          return [piece, ...rest];
        }
      }
    }

    return null;
  }

  private enumerateLegalCandidates(board: CellState[], allowSameColorDouble: boolean): Piece[] {
    const candidates: Piece[] = [];
    const colors = this.getActiveColors();

    for (const size of RING_SIZES) {
      for (const color of colors) {
        const piece = this.makeCandidate([{ size, color }]);
        if (this.hasAnyPlacement(piece, board)) {
          candidates.push(piece);
        }
      }
    }

    for (let firstSizeIndex = 0; firstSizeIndex < RING_SIZES.length; firstSizeIndex += 1) {
      for (let secondSizeIndex = firstSizeIndex + 1; secondSizeIndex < RING_SIZES.length; secondSizeIndex += 1) {
        for (const firstColor of colors) {
          for (const secondColor of colors) {
            if (!allowSameColorDouble && firstColor === secondColor) {
              continue;
            }

            const piece = this.makeCandidate([
              { size: RING_SIZES[firstSizeIndex], color: firstColor },
              { size: RING_SIZES[secondSizeIndex], color: secondColor },
            ]);

            if (this.hasAnyPlacement(piece, board)) {
              candidates.push(piece);
            }
          }
        }
      }
    }

    return candidates;
  }

  private rankCandidates(candidates: Piece[], board: CellState[]): CandidateRank[] {
    return candidates
      .map((piece) => ({ piece, score: this.scoreCandidate(piece, board) }))
      .sort((a, b) => b.score - a.score || Math.random() - 0.5);
  }

  private scoreCandidate(piece: Piece, board: CellState[]): number {
    const everyCellOccupied = this.isEveryCellOccupied(board);
    const avoidImmediateClear = this.shouldAvoidImmediateClears(board);
    let bestScore = everyCellOccupied ? 20 : 0;
    let hasImmediateClearPlacement = false;

    for (let cellIndex = 0; cellIndex < CELL_COUNT; cellIndex += 1) {
      if (!this.canPlacePiece(piece, cellIndex, board)) {
        continue;
      }

      const preview = this.simulatePlacement(piece, cellIndex, board);
      if (preview.clearedRings > 0) {
        hasImmediateClearPlacement = true;
      }

      let score = this.scoreClearResult(preview.clearedRings, avoidImmediateClear, everyCellOccupied);
      for (const ring of piece.rings) {
        score += this.scoreThreat(this.lineThreatScore(board, cellIndex, ring.color), avoidImmediateClear, everyCellOccupied);
        score += this.scoreThreat(this.stackThreatScore(board[cellIndex], ring.color), avoidImmediateClear, everyCellOccupied);
      }

      bestScore = Math.max(bestScore, score);
    }

    if (avoidImmediateClear && hasImmediateClearPlacement) {
      bestScore -= 3200;
    }

    return bestScore + Math.random();
  }

  private getActiveColors(): RingColor[] {
    const unlockedCount = Math.min(
      COLOR_UNLOCK_ORDER.length,
      START_COLOR_COUNT + Math.floor(this.clearCount / CLEARS_PER_COLOR_UNLOCK),
    );

    return COLOR_UNLOCK_ORDER.slice(0, unlockedCount);
  }

  private shouldAvoidImmediateClears(board: CellState[]): boolean {
    return this.clearCount >= AVOID_IMMEDIATE_CLEAR_AFTER && !this.isEveryCellOccupied(board);
  }

  private scoreClearResult(clearedRings: number, avoidImmediateClear: boolean, everyCellOccupied: boolean): number {
    if (clearedRings <= 0) {
      return avoidImmediateClear ? 120 : 0;
    }

    if (everyCellOccupied) {
      return clearedRings * 1200;
    }

    if (avoidImmediateClear) {
      return -clearedRings * 2600;
    }

    return clearedRings * 1000;
  }

  private scoreThreat(threatScore: number, avoidImmediateClear: boolean, everyCellOccupied: boolean): number {
    if (everyCellOccupied) {
      return threatScore;
    }

    if (avoidImmediateClear) {
      return Math.floor(threatScore * 0.15);
    }

    return threatScore;
  }

  private lineThreatScore(board: CellState[], cellIndex: number, color: RingColor): number {
    let score = 0;
    for (const line of LINES) {
      if (!line.includes(cellIndex)) {
        continue;
      }

      const matches = line.filter((lineCellIndex) => this.cellHasColor(board[lineCellIndex], color)).length;
      if (matches === 2) {
        score += 240;
      } else if (matches === 1) {
        score += 40;
      }
    }

    return score;
  }

  private stackThreatScore(cell: CellState, color: RingColor): number {
    const matches = cell.filter((ring) => ring?.color === color).length;
    if (matches === 2) {
      return 260;
    }

    if (matches === 1) {
      return 50;
    }

    return 0;
  }

  private getRankedPlacements(piece: Piece, board: CellState[]): number[] {
    const placements: Array<{ cellIndex: number; score: number }> = [];
    const everyCellOccupied = this.isEveryCellOccupied(board);
    const avoidImmediateClear = this.shouldAvoidImmediateClears(board);

    for (let cellIndex = 0; cellIndex < CELL_COUNT; cellIndex += 1) {
      if (!this.canPlacePiece(piece, cellIndex, board)) {
        continue;
      }

      const preview = this.simulatePlacement(piece, cellIndex, board);
      placements.push({
        cellIndex,
        score: this.scoreClearResult(preview.clearedRings, avoidImmediateClear, everyCellOccupied)
          + piece.rings.reduce((sum, ring) => sum + this.scoreThreat(this.lineThreatScore(board, cellIndex, ring.color), avoidImmediateClear, everyCellOccupied), 0),
      });
    }

    return placements
      .sort((a, b) => b.score - a.score || Math.random() - 0.5)
      .map((placement) => placement.cellIndex);
  }

  private makeCandidate(rings: Ring[]): Piece {
    return {
      id: 0,
      rings: rings
        .map((ring) => ({ ...ring }))
        .sort((a, b) => b.size - a.size),
    };
  }

  private simulatePlacement(piece: Piece, cellIndex: number, board: CellState[]): SimulatedPlacement {
    const nextBoard = this.cloneBoard(board);
    const cell = nextBoard[cellIndex];
    for (const ring of piece.rings) {
      cell[ring.size] = { ...ring };
    }

    const clearedRings = this.resolveClears(nextBoard);
    return {
      board: nextBoard,
      clearedRings,
    };
  }

  private resolveClears(board: CellState[]): number {
    const clearSlots = this.createClearMask();

    for (const color of RING_COLORS) {
      for (const line of LINES) {
        if (line.every((cellIndex) => this.cellHasColor(board[cellIndex], color))) {
          for (const cellIndex of line) {
            this.markColorInCell(board[cellIndex], clearSlots[cellIndex], color);
          }
        }
      }
    }

    for (let cellIndex = 0; cellIndex < CELL_COUNT; cellIndex += 1) {
      const cell = board[cellIndex];
      const firstColor = cell[0]?.color;
      if (firstColor && cell.every((ring) => ring?.color === firstColor)) {
        clearSlots[cellIndex][0] = true;
        clearSlots[cellIndex][1] = true;
        clearSlots[cellIndex][2] = true;
      }
    }

    let cleared = 0;
    for (let cellIndex = 0; cellIndex < CELL_COUNT; cellIndex += 1) {
      for (const size of RING_SIZES) {
        if (clearSlots[cellIndex][size] && board[cellIndex][size]) {
          board[cellIndex][size] = null;
          cleared += 1;
        }
      }
    }

    return cleared;
  }

  private cellHasColor(cell: CellState, color: RingColor): boolean {
    return cell.some((ring) => ring?.color === color);
  }

  private markColorInCell(cell: CellState, mask: [boolean, boolean, boolean], color: RingColor): void {
    for (const size of RING_SIZES) {
      if (cell[size]?.color === color) {
        mask[size] = true;
      }
    }
  }

  private createClearMask(): Array<[boolean, boolean, boolean]> {
    return Array.from({ length: CELL_COUNT }, () => [false, false, false] as [boolean, boolean, boolean]);
  }

  private createEmptyBoard(): CellState[] {
    return Array.from({ length: CELL_COUNT }, () => [null, null, null] as CellState);
  }

  private cloneBoard(board: CellState[]): CellState[] {
    return board.map((cell) => cell.map((ring) => (ring ? { ...ring } : null)) as CellState);
  }
}
