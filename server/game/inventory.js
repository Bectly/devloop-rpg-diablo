const GRID_COLS = 10;
const GRID_ROWS = 6;

class Inventory {
  constructor() {
    // Grid: 2D array, each cell is null or item ID
    this.grid = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      this.grid[r] = new Array(GRID_COLS).fill(null);
    }
    // Items by ID for quick lookup
    this.items = new Map();
  }

  // Check if an item fits at position (col, row)
  canPlace(col, row, gridW, gridH, ignoreItemId = null) {
    if (col < 0 || row < 0) return false;
    if (col + gridW > GRID_COLS || row + gridH > GRID_ROWS) return false;

    for (let r = row; r < row + gridH; r++) {
      for (let c = col; c < col + gridW; c++) {
        if (this.grid[r][c] !== null && this.grid[r][c] !== ignoreItemId) {
          return false;
        }
      }
    }
    return true;
  }

  // Find first available position for an item
  findSpace(gridW, gridH) {
    for (let r = 0; r <= GRID_ROWS - gridH; r++) {
      for (let c = 0; c <= GRID_COLS - gridW; c++) {
        if (this.canPlace(c, r, gridW, gridH)) {
          return { col: c, row: r };
        }
      }
    }
    return null;
  }

  // Find existing stackable item of same type
  findStackable(item) {
    if (!item.stackable) return null;
    for (const [id, existing] of this.items) {
      if (existing.subType === item.subType && existing.quantity < existing.maxStack) {
        return existing;
      }
    }
    return null;
  }

  // Place item at specific position
  placeAt(item, col, row) {
    for (let r = row; r < row + item.gridH; r++) {
      for (let c = col; c < col + item.gridW; c++) {
        this.grid[r][c] = item.id;
      }
    }
    item.gridCol = col;
    item.gridRow = row;
    this.items.set(item.id, item);
  }

  // Remove item from grid
  removeFromGrid(itemId) {
    const item = this.items.get(itemId);
    if (!item) return null;

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.grid[r][c] === itemId) {
          this.grid[r][c] = null;
        }
      }
    }
    this.items.delete(itemId);
    return item;
  }

  // Add item to inventory (auto-place)
  addItem(item) {
    // Try stacking first
    if (item.stackable) {
      const existing = this.findStackable(item);
      if (existing) {
        const space = existing.maxStack - existing.quantity;
        const toAdd = Math.min(space, item.quantity);
        existing.quantity += toAdd;
        item.quantity -= toAdd;
        if (item.quantity <= 0) {
          return { success: true, stacked: true, item: existing };
        }
        // Remaining needs a new slot
      }
    }

    // Find space
    const pos = this.findSpace(item.gridW, item.gridH);
    if (!pos) {
      return { success: false, reason: 'Inventory full' };
    }

    this.placeAt(item, pos.col, pos.row);
    return { success: true, stacked: false, item };
  }

  // Move item within grid
  moveItem(itemId, toCol, toRow) {
    const item = this.items.get(itemId);
    if (!item) return { success: false, reason: 'Item not found' };

    // Remove from current position first
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.grid[r][c] === itemId) {
          this.grid[r][c] = null;
        }
      }
    }

    // Check if new position is valid
    if (!this.canPlace(toCol, toRow, item.gridW, item.gridH)) {
      // Put it back
      this.placeAt(item, item.gridCol, item.gridRow);
      return { success: false, reason: 'Cannot place there' };
    }

    this.placeAt(item, toCol, toRow);
    return { success: true };
  }

  // Get item by ID
  getItem(itemId) {
    return this.items.get(itemId) || null;
  }

  // Remove item completely
  removeItem(itemId) {
    return this.removeFromGrid(itemId);
  }

  // Get all items
  getAllItems() {
    return Array.from(this.items.values());
  }

  // Serialize for network
  serialize() {
    const gridSnapshot = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      gridSnapshot[r] = [...this.grid[r]];
    }

    return {
      grid: gridSnapshot,
      items: Array.from(this.items.values()).map(item => ({
        id: item.id,
        name: item.name,
        type: item.type,
        subType: item.subType,
        slot: item.slot,
        rarity: item.rarity,
        rarityColor: item.rarityColor,
        damage: item.damage,
        armor: item.armor,
        bonuses: item.bonuses,
        gridW: item.gridW,
        gridH: item.gridH,
        gridCol: item.gridCol,
        gridRow: item.gridRow,
        stackable: item.stackable,
        quantity: item.quantity,
        description: item.description,
        sockets: item.sockets,
        isSetItem: item.isSetItem,
        setId: item.setId,
        level: item.level,
        itemLevel: item.itemLevel,
        gemType: item.gemType,
        gemTier: item.gemTier,
        color: item.color,
      })),
      cols: GRID_COLS,
      rows: GRID_ROWS,
    };
  }
}

module.exports = { Inventory, GRID_COLS, GRID_ROWS };
