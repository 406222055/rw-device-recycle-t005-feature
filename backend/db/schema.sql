CREATE TABLE devices (
  id VARCHAR(40) PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  category VARCHAR(32) NOT NULL,
  brand VARCHAR(64) NOT NULL,
  model VARCHAR(128) NOT NULL,
  serial_number VARCHAR(128) NOT NULL UNIQUE,
  source_channel VARCHAR(64) NOT NULL,
  owner_name VARCHAR(64) NOT NULL,
  owner_phone VARCHAR(32) NOT NULL,
  expected_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  accessories TEXT,
  issue_description TEXT,
  status VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE inspections (
  id VARCHAR(40) PRIMARY KEY,
  device_id VARCHAR(40) NOT NULL,
  screen_condition VARCHAR(32) NOT NULL,
  battery_condition VARCHAR(32) NOT NULL,
  body_condition VARCHAR(32) NOT NULL,
  function_condition VARCHAR(32) NOT NULL,
  has_repair_lock BOOLEAN NOT NULL DEFAULT FALSE,
  missing_accessories INTEGER NOT NULL DEFAULT 0,
  repair_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  score INTEGER NOT NULL,
  grade VARCHAR(8) NOT NULL,
  quote_price DECIMAL(10,2) NOT NULL,
  risk_flags TEXT,
  inspector VARCHAR(64) NOT NULL,
  inspected_at DATETIME NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE recycle_decisions (
  id VARCHAR(40) PRIMARY KEY,
  device_id VARCHAR(40) NOT NULL,
  decision VARCHAR(16) NOT NULL,
  final_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  note TEXT,
  decided_at DATETIME NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE inventory_items (
  id VARCHAR(40) PRIMARY KEY,
  device_id VARCHAR(40) NOT NULL UNIQUE,
  refurbish_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  target_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  channel VARCHAR(64) NOT NULL,
  inventory_status VARCHAR(32) NOT NULL,
  listed_at DATETIME,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_category ON devices(category);
CREATE INDEX idx_devices_created_at ON devices(created_at);
CREATE INDEX idx_inspections_device_id ON inspections(device_id);
CREATE INDEX idx_inventory_status ON inventory_items(inventory_status);
