import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Graphics,
  HorizontalTextAlignment,
  js,
  Label,
  Layers,
  Node,
  resources,
  Sprite,
  SpriteFrame,
  UITransform,
  Vec3,
  VerticalTextAlignment,
} from 'cc';
import { GameModel } from './GameModel';
import { Piece, RING_COLOR_HEX, Ring, RingSize } from './GameTypes';

const { ccclass } = _decorator;

const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1440;
const BACKGROUND_HEIGHT = 1620;
const BACKGROUND_RESOURCE = 'images/bt';

const BOARD_X = [-220, 0, 220];
const BOARD_Y = [320, 80, -160];
const HAND_X = [-220, 0, 220];
const HAND_Y = -560;
const SNAP_RADIUS = 112;

const DOT_RADIUS = 12;
const RING_RADIUS: Record<RingSize, number> = {
  [RingSize.Inner]: 28,
  [RingSize.Middle]: 54,
  [RingSize.Outer]: 80,
};
const RING_LINE_WIDTH = 16;

@ccclass('GameController')
export class GameController extends Component {
  private model = new GameModel();
  private canvasNode: Node | null = null;
  private canvasTransform: UITransform | null = null;
  private backgroundLayer: Node | null = null;
  private boardLayer: Node | null = null;
  private handLayer: Node | null = null;
  private uiLayer: Node | null = null;
  private overlayLayer: Node | null = null;
  private scoreLabel: Label | null = null;
  private finalScoreLabel: Label | null = null;
  private cellNodes: Node[] = [];
  private pieceNodes: Array<Node | null> = [null, null, null];
  private cellPositions: Vec3[] = [];
  private dragging: { slotIndex: number; node: Node; origin: Vec3 } | null = null;

  protected start(): void {
    this.buildScene();
    this.startNewGame();
  }

  private buildScene(): void {
    this.node.destroyAllChildren();
    this.node.layer = Layers.Enum.UI_2D;

    this.canvasNode = this.node.parent ?? this.node;
    this.canvasTransform = this.canvasNode.getComponent(UITransform);
    if (!this.canvasTransform) {
      this.canvasTransform = this.canvasNode.addComponent(UITransform);
      this.canvasTransform.setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
    }

    this.ensureTransform(this.node, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.node.setPosition(0, 0, 0);

    this.backgroundLayer = this.createNode('BackgroundLayer', this.node, DESIGN_WIDTH, BACKGROUND_HEIGHT);
    this.boardLayer = this.createNode('BoardLayer', this.node, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.handLayer = this.createNode('HandLayer', this.node, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.uiLayer = this.createNode('UILayer', this.node, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.overlayLayer = this.createNode('GameOverOverlay', this.node, DESIGN_WIDTH, DESIGN_HEIGHT);

    this.createBackground();
    this.createTopUi();
    this.createBoard();
    this.createOverlay();
  }

  private startNewGame(): void {
    this.model.reset();
    this.dragging = null;
    if (this.overlayLayer) {
      this.overlayLayer.active = false;
    }

    this.refreshScore();
    this.refreshBoard();
    this.refreshHand();
  }

  private createBackground(): void {
    if (!this.backgroundLayer) {
      return;
    }

    const fallback = this.createNode('BackgroundFallback', this.backgroundLayer, DESIGN_WIDTH, BACKGROUND_HEIGHT);
    fallback.setPosition(0, 0, 0);

    const fallbackGraphics = fallback.addComponent(Graphics);
    fallbackGraphics.fillColor = new Color(18, 28, 58, 255);
    fallbackGraphics.rect(-DESIGN_WIDTH / 2, -BACKGROUND_HEIGHT / 2, DESIGN_WIDTH, BACKGROUND_HEIGHT);
    fallbackGraphics.fill();

    const background = this.createNode('BackgroundImage', this.backgroundLayer, DESIGN_WIDTH, BACKGROUND_HEIGHT);
    background.setPosition(0, 0, 0);
    background.active = false;

    const sprite = background.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;

    const applyFrame = (spriteFrame: SpriteFrame | null): void => {
      if (!spriteFrame) {
        return;
      }

      sprite.spriteFrame = spriteFrame;
      this.ensureTransform(background, DESIGN_WIDTH, BACKGROUND_HEIGHT);
      background.active = true;
      fallback.active = false;
    };

    resources.load(`${BACKGROUND_RESOURCE}/spriteFrame`, SpriteFrame, (firstError, frame) => {
      if (!firstError && frame) {
        applyFrame(frame);
        return;
      }

      resources.load(BACKGROUND_RESOURCE, SpriteFrame, (secondError, fallbackFrame) => {
        if (!secondError && fallbackFrame) {
          applyFrame(fallbackFrame);
        }
      });
    });
  }

  private createTopUi(): void {
    if (!this.uiLayer) {
      return;
    }

    const scoreTitle = this.createLabelNode('ScoreTitle', this.uiLayer, 'SCORE', 24, new Color(154, 181, 216, 255), 160, 36);
    scoreTitle.setPosition(-270, 610, 0);

    const scoreNode = this.createLabelNode('ScoreLabel', this.uiLayer, '0', 62, Color.WHITE, 180, 84);
    scoreNode.setPosition(-270, 560, 0);
    this.scoreLabel = scoreNode.getComponent(Label);

    const restart = this.createButton('RestartButton', '重开', 132, 56);
    restart.parent = this.uiLayer;
    restart.setPosition(270, 590, 0);
    restart.on(Node.EventType.TOUCH_END, () => this.startNewGame(), this);
  }

  private createBoard(): void {
    if (!this.boardLayer) {
      return;
    }

    this.cellNodes = [];
    this.cellPositions = [];

    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const index = row * 3 + col;
        const cell = this.createNode(`Cell-${index}`, this.boardLayer, 190, 190);
        const position = new Vec3(BOARD_X[col], BOARD_Y[row], 0);
        cell.setPosition(position);
        cell.addComponent(Graphics);
        this.cellNodes.push(cell);
        this.cellPositions.push(position);
      }
    }
  }

  private createOverlay(): void {
    if (!this.overlayLayer) {
      return;
    }

    const graphics = this.overlayLayer.addComponent(Graphics);
    graphics.fillColor = new Color(5, 9, 22, 205);
    graphics.rect(-DESIGN_WIDTH / 2, -DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT);
    graphics.fill();

    const title = this.createLabelNode('GameOverTitle', this.overlayLayer, '游戏结束', 58, Color.WHITE, 320, 80);
    title.setPosition(0, 110, 0);

    const finalScore = this.createLabelNode('FinalScore', this.overlayLayer, '分数 0', 34, new Color(210, 226, 255, 255), 300, 58);
    finalScore.setPosition(0, 25, 0);
    this.finalScoreLabel = finalScore.getComponent(Label);

    const restart = this.createButton('OverlayRestart', '重新开始', 210, 64);
    restart.parent = this.overlayLayer;
    restart.setPosition(0, -95, 0);
    restart.on(Node.EventType.TOUCH_END, () => this.startNewGame(), this);

    this.overlayLayer.active = false;
  }

  private refreshBoard(): void {
    for (let cellIndex = 0; cellIndex < this.cellNodes.length; cellIndex += 1) {
      const node = this.cellNodes[cellIndex];
      const graphics = node.getComponent(Graphics);
      if (!graphics) {
        continue;
      }

      graphics.clear();

      const cell = this.model.board[cellIndex];
      const rings = cell.filter((ring): ring is Ring => ring !== null)
        .sort((a, b) => b.size - a.size);

      for (const ring of rings) {
        this.drawRing(graphics, ring);
      }

      graphics.fillColor = Color.WHITE;
      graphics.circle(0, 0, DOT_RADIUS);
      graphics.fill();
    }
  }

  private refreshHand(): void {
    if (!this.handLayer) {
      return;
    }

    for (const node of this.pieceNodes) {
      node?.destroy();
    }
    this.pieceNodes = [null, null, null];

    for (let slotIndex = 0; slotIndex < this.model.hand.length; slotIndex += 1) {
      const piece = this.model.hand[slotIndex];
      if (!piece) {
        continue;
      }

      const node = this.createPieceNode(slotIndex, piece);
      node.parent = this.handLayer;
      node.setPosition(HAND_X[slotIndex], HAND_Y, 0);
      this.pieceNodes[slotIndex] = node;
    }

    this.showGameOverIfNeeded();
  }

  private createPieceNode(slotIndex: number, piece: Piece): Node {
    const node = this.createNode(`Piece-${slotIndex}`, null, 190, 190);
    const graphics = node.addComponent(Graphics);
    this.drawPiece(graphics, piece);

    node.on(Node.EventType.TOUCH_START, (event: EventTouch) => this.onPieceTouchStart(slotIndex, node, event), this);
    node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => this.onPieceTouchMove(event), this);
    node.on(Node.EventType.TOUCH_END, (event: EventTouch) => this.onPieceTouchEnd(event), this);
    node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => this.onPieceTouchEnd(event), this);

    return node;
  }

  private onPieceTouchStart(slotIndex: number, node: Node, event: EventTouch): void {
    if (this.model.gameOver || !this.model.hand[slotIndex]) {
      return;
    }

    event.propagationStopped = true;
    this.dragging = {
      slotIndex,
      node,
      origin: new Vec3(node.position.x, node.position.y, node.position.z),
    };
    node.setSiblingIndex(999);
    node.setScale(1.08, 1.08, 1);
    this.moveDraggingNode(event);
  }

  private onPieceTouchMove(event: EventTouch): void {
    if (!this.dragging) {
      return;
    }

    event.propagationStopped = true;
    this.moveDraggingNode(event);
  }

  private onPieceTouchEnd(event: EventTouch): void {
    if (!this.dragging) {
      return;
    }

    event.propagationStopped = true;
    this.moveDraggingNode(event);

    const dragging = this.dragging;
    const localPosition = dragging.node.position;
    const cellIndex = this.findNearestCell(localPosition);
    const canPlace = cellIndex >= 0 && this.model.canCommitPieceToCell(dragging.slotIndex, cellIndex);

    if (canPlace) {
      const result = this.model.placePiece(dragging.slotIndex, cellIndex);
      if (result.placed) {
        dragging.node.destroy();
        this.pieceNodes[dragging.slotIndex] = null;
        this.dragging = null;
        this.refreshScore();
        this.refreshBoard();
        this.refreshHand();
        return;
      }
    }

    dragging.node.setPosition(dragging.origin);
    dragging.node.setScale(1, 1, 1);
    this.dragging = null;
  }

  private moveDraggingNode(event: EventTouch): void {
    if (!this.dragging || !this.canvasTransform) {
      return;
    }

    const uiLocation = event.getUILocation();
    const local = this.canvasTransform.convertToNodeSpaceAR(new Vec3(uiLocation.x, uiLocation.y, 0));
    this.dragging.node.setPosition(local.x, local.y, 0);
  }

  private findNearestCell(position: Readonly<Vec3>): number {
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < this.cellPositions.length; index += 1) {
      const cellPosition = this.cellPositions[index];
      const dx = position.x - cellPosition.x;
      const dy = position.y - cellPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }

    return nearestDistance <= SNAP_RADIUS ? nearestIndex : -1;
  }

  private refreshScore(): void {
    if (this.scoreLabel) {
      this.scoreLabel.string = `${this.model.score}`;
    }
  }

  private showGameOverIfNeeded(): void {
    if (!this.overlayLayer || !this.model.gameOver) {
      return;
    }

    if (this.finalScoreLabel) {
      this.finalScoreLabel.string = `分数 ${this.model.score}`;
    }
    this.overlayLayer.active = true;
    this.overlayLayer.setSiblingIndex(999);
  }

  private drawPiece(graphics: Graphics, piece: Piece): void {
    graphics.clear();
    const rings = piece.rings.slice().sort((a, b) => b.size - a.size);
    for (const ring of rings) {
      this.drawRing(graphics, ring);
    }
  }

  private drawRing(graphics: Graphics, ring: Ring): void {
    graphics.lineWidth = RING_LINE_WIDTH;
    graphics.strokeColor = this.hexToColor(RING_COLOR_HEX[ring.color]);
    graphics.circle(0, 0, RING_RADIUS[ring.size]);
    graphics.stroke();
  }

  private createButton(name: string, text: string, width: number, height: number): Node {
    const button = this.createNode(name, null, width, height);
    const graphics = button.addComponent(Graphics);
    graphics.fillColor = new Color(38, 61, 116, 235);
    graphics.strokeColor = new Color(118, 149, 211, 255);
    graphics.lineWidth = 2;
    graphics.roundRect(-width / 2, -height / 2, width, height, 12);
    graphics.fill();
    graphics.stroke();

    const labelNode = this.createLabelNode(`${name}Label`, button, text, 28, Color.WHITE, width, height);
    labelNode.setPosition(0, 0, 0);

    return button;
  }

  private createLabelNode(name: string, parent: Node | null, text: string, size: number, color: Color, width: number, height: number): Node {
    const node = this.createNode(name, parent, width, height);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size + 6;
    label.color = color;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    return node;
  }

  private createNode(name: string, parent: Node | null, width: number, height: number): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    if (parent) {
      node.parent = parent;
    }

    this.ensureTransform(node, width, height);
    return node;
  }

  private ensureTransform(node: Node, width: number, height: number): UITransform {
    let transform = node.getComponent(UITransform);
    if (!transform) {
      transform = node.addComponent(UITransform);
    }
    transform.setContentSize(width, height);
    transform.setAnchorPoint(0.5, 0.5);
    return transform;
  }

  private hexToColor(hex: string): Color {
    const value = hex.replace('#', '');
    return new Color(
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16),
      255,
    );
  }
}

js.setClassAlias(GameController, 'GameController');
js.setClassAlias(GameController, '3d3fc3d3-3ef1-4f43-a793-cc6ee1f5a931');
