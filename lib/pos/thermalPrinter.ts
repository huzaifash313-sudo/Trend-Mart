/**
 * TrendsMart POS — Bluetooth BLE + USB Serial thermal printer bridge.
 * Device choice is per-browser (localStorage). Falls back to browser print.
 */

export type ThermalPrintTarget = "browser" | "bluetooth" | "serial";

const LS_TARGET = "trendsmart_pos_print_target_v1";
const LS_BT_NAME = "trendsmart_pos_bt_printer_name_v1";

type BtCharacteristic = {
  writeValue: (data: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (data: BufferSource) => Promise<void>;
};

type BtDevice = {
  id: string;
  name?: string;
  gatt?: {
    connected: boolean;
    connect: () => Promise<{
      getPrimaryServices: () => Promise<
        Array<{
          getCharacteristics: () => Promise<
            Array<BtCharacteristic & { properties: { write?: boolean; writeWithoutResponse?: boolean } }>
          >;
        }>
      >;
    }>;
    disconnect: () => void;
  };
  addEventListener: (type: string, listener: () => void) => void;
};

type SerialPort = {
  open: (opts: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  writable: WritableStream<Uint8Array> | null;
  readable: ReadableStream<Uint8Array> | null;
};

let btDevice: BtDevice | null = null;
let btChar: BtCharacteristic | null = null;
let serialPort: SerialPort | null = null;

export function getPrintTarget(): ThermalPrintTarget {
  if (typeof window === "undefined") return "browser";
  const v = localStorage.getItem(LS_TARGET);
  if (v === "bluetooth" || v === "serial" || v === "browser") return v;
  return "browser";
}

export function setPrintTarget(target: ThermalPrintTarget) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_TARGET, target);
}

export function getSavedBluetoothName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_BT_NAME);
}

export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function isSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export function printerConnectionLabel(): string {
  const target = getPrintTarget();
  if (target === "bluetooth") {
    if (btChar) return `Bluetooth · ${btDevice?.name || getSavedBluetoothName() || "connected"}`;
    return `Bluetooth · ${getSavedBluetoothName() || "not connected"}`;
  }
  if (target === "serial") {
    return serialPort ? "USB Serial · connected" : "USB Serial · not connected";
  }
  return "Browser print dialog (USB / OS Bluetooth)";
}

async function writeChunks(write: (chunk: Uint8Array) => Promise<void>, data: Uint8Array) {
  const size = 180;
  for (let i = 0; i < data.length; i += size) {
    await write(data.subarray(i, Math.min(i + size, data.length)));
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Pair / reconnect a BLE ESC/POS thermal printer (Chrome / Edge / Android Chrome). */
export async function connectBluetoothPrinter(): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  if (!isBluetoothSupported()) {
    return {
      ok: false,
      error: "Web Bluetooth not supported here. Use Chrome/Edge, or USB Serial / browser print.",
    };
  }
  try {
    const nav = navigator as unknown as {
      bluetooth: {
        requestDevice: (opts: {
          acceptAllDevices?: boolean;
          optionalServices?: string[];
          filters?: Array<{ services?: string[]; namePrefix?: string }>;
        }) => Promise<BtDevice>;
      };
    };
    // Many cheap BLE printers expose serial-like service UUID
    const device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        "000018f0-0000-1000-8000-00805f9b34fb",
        "0000ff00-0000-1000-8000-00805f9b34fb",
        "0000ffe0-0000-1000-8000-00805f9b34fb",
        "49535343-fe7d-4ae5-8fa9-9fafd205e455",
      ],
    });
    if (!device.gatt) return { ok: false, error: "Printer has no GATT server." };
    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();
    let chosen: BtCharacteristic | null = null;
    for (const svc of services) {
      const chars = await svc.getCharacteristics();
      for (const c of chars) {
        if (c.properties.write || c.properties.writeWithoutResponse) {
          chosen = c;
          break;
        }
      }
      if (chosen) break;
    }
    if (!chosen) {
      return { ok: false, error: "No writable Bluetooth characteristic found on this device." };
    }
    btDevice = device;
    btChar = chosen;
    device.addEventListener("gattserverdisconnected", () => {
      btChar = null;
    });
    const name = device.name || "Bluetooth printer";
    localStorage.setItem(LS_BT_NAME, name);
    setPrintTarget("bluetooth");
    return { ok: true, name };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bluetooth pairing cancelled.";
    return { ok: false, error: msg };
  }
}

/** Connect USB / serial adapter thermal printer (Chrome desktop). */
export async function connectSerialPrinter(
  baudRate = 9600,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSerialSupported()) {
    return {
      ok: false,
      error: "Web Serial not supported. Use Chrome desktop with USB cable, or browser print.",
    };
  }
  try {
    const nav = navigator as unknown as {
      serial: { requestPort: () => Promise<SerialPort> };
    };
    const port = await nav.serial.requestPort();
    await port.open({ baudRate });
    serialPort = port;
    setPrintTarget("serial");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Serial port cancelled.";
    return { ok: false, error: msg };
  }
}

export async function disconnectThermalPrinter() {
  try {
    btDevice?.gatt?.disconnect();
  } catch {
    /* ignore */
  }
  btDevice = null;
  btChar = null;
  if (serialPort) {
    try {
      await serialPort.close();
    } catch {
      /* ignore */
    }
    serialPort = null;
  }
}

export async function printRawEscPos(
  data: Uint8Array,
): Promise<{ ok: true; via: ThermalPrintTarget } | { ok: false; error: string }> {
  const target = getPrintTarget();

  if (target === "bluetooth") {
    if (!btChar) {
      const paired = await connectBluetoothPrinter();
      if (!paired.ok) return paired;
    }
    if (!btChar) return { ok: false, error: "Bluetooth printer not connected." };
    try {
      const char = btChar;
      await writeChunks(async (chunk) => {
        const view = new Uint8Array(chunk);
        if (char.writeValueWithoutResponse) {
          await char.writeValueWithoutResponse(view as unknown as BufferSource);
        } else {
          await char.writeValue(view as unknown as BufferSource);
        }
      }, data);
      return { ok: true, via: "bluetooth" };
    } catch (err) {
      btChar = null;
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Bluetooth print failed.",
      };
    }
  }

  if (target === "serial") {
    if (!serialPort?.writable) {
      const opened = await connectSerialPrinter();
      if (!opened.ok) return opened;
    }
    if (!serialPort?.writable) return { ok: false, error: "USB printer not connected." };
    try {
      const writer = serialPort.writable.getWriter();
      try {
        await writeChunks(async (chunk) => {
          await writer.write(chunk);
        }, data);
      } finally {
        writer.releaseLock();
      }
      return { ok: true, via: "serial" };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "USB serial print failed.",
      };
    }
  }

  return { ok: false, error: "Print target is browser — use window.print()." };
}

export function isThermalTargetReady(): boolean {
  const t = getPrintTarget();
  if (t === "bluetooth") return Boolean(btChar);
  if (t === "serial") return Boolean(serialPort?.writable);
  return false;
}
