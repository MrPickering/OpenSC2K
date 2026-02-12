import Phaser from 'phaser';
import * as CONST from '../constants';

export default class viewport {
  constructor(options) {
    this.scene        = options.scene;
    this.camera       = this.scene.cameras.main;
    this.camera.name  = CONST.CAMERA_NAME;
    this.worldView    = this.camera.worldView;

    this.objectsRendered = 0;

    this.viewportPaddingMultiplier = 1.5;

    this.worldPoint = {
      x: 0,
      y: 0
    };

    let keys = this.scene.input.keyboard.addKeys({
      'up': Phaser.Input.Keyboard.KeyCodes.W,
      'down': Phaser.Input.Keyboard.KeyCodes.S,
      'left': Phaser.Input.Keyboard.KeyCodes.A,
      'right': Phaser.Input.Keyboard.KeyCodes.D,
      'zoomIn': Phaser.Input.Keyboard.KeyCodes.Q,
      'zoomOut': Phaser.Input.Keyboard.KeyCodes.E,
    });

    let controlConfig = {
      camera: this.camera,
      up: keys.up,
      down: keys.down,
      left: keys.left,
      right: keys.right,
      zoomIn: keys.zoomIn,
      zoomOut: keys.zoomOut,
      acceleration: 0.04,
      drag: 0.0005,
      maxSpeed: 1
    };

    this.controls = new Phaser.Cameras.Controls.SmoothedKeyControl(controlConfig);

    this.camera.scrollX = -1531;
    this.camera.scrollY = 140;
    this.camera.zoom = 1;

    // Touch controls state
    this._pinchDistance = 0;
    this._isDragging = false;
    this._dragMoved = false;
    this._dragThreshold = 8; // pixels before drag is recognized

    this._setupTouchControls();
  }


  _setupTouchControls () {
    let input = this.scene.input;

    input.on('pointerdown', (pointer) => {
      this._isDragging = true;
      this._dragMoved = false;
    });

    input.on('pointermove', (pointer) => {
      let pointer1 = input.pointer1;
      let pointer2 = input.pointer2;

      // Pinch-to-zoom with two fingers
      if (pointer1.isDown && pointer2.isDown) {
        let dist = Phaser.Math.Distance.Between(
          pointer1.x, pointer1.y,
          pointer2.x, pointer2.y
        );

        if (this._pinchDistance > 0) {
          let zoomDelta = (dist - this._pinchDistance) * 0.003;
          this.camera.zoom = Phaser.Math.Clamp(
            this.camera.zoom + zoomDelta, 0.2, 3
          );
          this.cullObjects();
        }

        this._pinchDistance = dist;
        this._dragMoved = true;
        return;
      }

      this._pinchDistance = 0;

      // Single-finger drag-to-pan
      if (pointer.isDown && this._isDragging) {
        let dx = pointer.x - pointer.prevPosition.x;
        let dy = pointer.y - pointer.prevPosition.y;

        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          this._dragMoved = true;
        }

        this.camera.scrollX -= dx / this.camera.zoom;
        this.camera.scrollY -= dy / this.camera.zoom;
        this.cullObjects();
      }
    });

    input.on('pointerup', () => {
      this._isDragging = false;
      this._pinchDistance = 0;
    });
  }


  wasDragGesture () {
    return this._dragMoved;
  }


  onPointerMove (pointer) {
    let { x, y } = this.camera.getWorldPoint(pointer.x, pointer.y);

    this.worldPoint.x = x;
    this.worldPoint.y = y;
  }


  update (delta) {
    this.controls.update(delta);

    if (this.controls._speedX !== 0 || this.controls._speedY !== 0 || this.controls._zoom !== 0)
      this.cullObjects();
  }


  cullObjects () {
    let cells = this.scene.city.map.cells;
    let view  = Phaser.Geom.Rectangle.Clone(this.worldView);
    let cx = view.centerX;
    let cy = view.centerY;

    Phaser.Geom.Rectangle.Scale(view, this.viewportPaddingMultiplier);
    Phaser.Geom.Rectangle.CenterOn(view, cx, cy);

    for (let x = 0; x < CONST.MAP_SIZE; x++)
      for (let y = 0; y < CONST.MAP_SIZE; y++)
        if (Phaser.Geom.Rectangle.Contains(view, cells[x][y].position.center.x, cells[x][y].position.center.y))
          cells[x][y].show();
        else
          cells[x][y].hide();


    this.objectsRendered = 0;

    this.scene.children.list.forEach((gameObject) => {
      if (gameObject.visible) this.objectsRendered++;
    });
  }
}