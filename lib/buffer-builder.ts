import { Command } from './command';
import { MutableBuffer } from 'mutable-buffer';
import * as iconv from 'iconv-lite';

export class BufferBuilder {


  private buffer: MutableBuffer;
  private textEncoding: string;

  constructor(private defaultSettings: boolean = true, textEncoding: string = 'ascii') {
    this.buffer = new MutableBuffer();
    this.textEncoding = textEncoding;
    if (this.defaultSettings) {
      this.resetCharacterSize();
      this.resetCharacterCodeTable();
    }
    if(textEncoding !== 'ascii') {
      this.enterKanjiPrintingMode();
    }

  }
  enterKanjiPrintingMode() {
    this.buffer.write(Command.FS_and);
    return this;
  }
  public end(): BufferBuilder {
    return this;
  }

  public resetCharacterCodeTable(): BufferBuilder {
    this.buffer.write(Command.ESC_t(0));
    return this;
  }

  public setCharacterSize(width: number = 0, height: number = 0): BufferBuilder {
    let size = (width << 4) + height;
    this.buffer.write(Command.GS_exclamation(size));
    return this;
  }

  public resetCharacterSize(): BufferBuilder {
    this.buffer.write(Command.GS_exclamation(0));
    return this;
  }

  public startCompressedCharacter(): BufferBuilder {
    this.buffer.write(Command.ESC_M(1));
    return this;
  }

  public endCompressedCharacter(): BufferBuilder {
    this.buffer.write(Command.ESC_M(0));
    return this;
  }

  public startBold(): BufferBuilder {
    this.buffer.write(Command.ESC_E(1));
    return this;
  }

  public endBold(): BufferBuilder {
    this.buffer.write(Command.ESC_E(0));
    return this;
  }

  public startUnderline(underlineMode: UNDERLINE_MODE = UNDERLINE_MODE.TWO_POINTS_OF_COARSE): BufferBuilder {
    this.buffer.write(Command.ESC_minus(underlineMode));
    return this;
  }

  public endUnderline(): BufferBuilder {
    this.buffer.write(Command.ESC_minus(48));
    return this;
  }

  public startAlign(alignment: ALIGNMENT): BufferBuilder {
    this.buffer.write(Command.ESC_a(alignment));
    return this;
  }

  public resetAlign(): BufferBuilder {
    return this.startAlign(ALIGNMENT.LEFT);
  }

  public startWhiteMode(): BufferBuilder {
    this.buffer.write(Command.GS_B(1));
    return this;
  }

  public endWhiteMode(): BufferBuilder {
    this.buffer.write(Command.GS_B(0));
    return this;
  }

  public startReverseMode(): BufferBuilder {
    this.buffer.write(Command.ESC_rev(1));
    return this;
  }

  public endReverseMode(): BufferBuilder {
    this.buffer.write(Command.ESC_rev(0));
    return this;
  }

  public printBarcode(data: string, barcodeSystem: BARCODE_SYSTEM, width: BARCODE_WIDTH = BARCODE_WIDTH.DOT_375, height: number = 162, labelFont: BARCODE_LABEL_FONT = BARCODE_LABEL_FONT.FONT_A, labelPosition: BARCODE_LABEL_POSITION = BARCODE_LABEL_POSITION.BOTTOM, leftSpacing: number = 0): BufferBuilder {
    this.buffer.write(Command.GS_w(width)); // width
    this.buffer.write(Command.GS_h(height)); // height
    this.buffer.write(Command.GS_x(leftSpacing)); // left spacing
    this.buffer.write(Command.GS_f(labelFont)); // HRI font
    this.buffer.write(Command.GS_H(labelPosition)); // HRI font
    this.buffer.write(Command.GS_K(barcodeSystem, data.length)); // data is a string in UTF-8
    this.buffer.write(data, 'ascii');
    return this;
  }

  public printQRcode(data: string, version: number = 1, errorCorrectionLevel: QR_EC_LEVEL = QR_EC_LEVEL.H, componentTypes: number = 8): BufferBuilder {
    const s = data.length+3;
    const pL = Math.floor(s % 256);
    const pH = Math.floor(s / 256);
    this.buffer.write([Command.GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x31, 0x00]); // qr code mode
    this.buffer.write([Command.GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x01]); // qr code size
    this.buffer.write([Command.GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31]); // qr code error correction level
    this.buffer.write([Command.GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]); // begin store data
    this.buffer.write(data, 'ascii');
    this.buffer.write([Command.GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]); // print qr code
    return this;
  }

  public printBitmap(pixels: {r: number, g: number, b: number, a: number}[][], width: number, height: number): BufferBuilder {
    const imageBuffer_array = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let pixel = pixels[y][x];
        let pos = x + y * width;
        let bytePos = Math.floor(pos / 8);
        let bitPos = 8 - (pos % 8) - 1;
        let value = imageBuffer_array[bytePos] || 0x00;
        if (this.isBlack(pixel)) {
          value |= (1 << bitPos); // setting the correct bit to 1
        }
        imageBuffer_array[bytePos] = value;
      }
    }
    const bitwidth = Math.ceil(width / 8);
    const bitheight = Math.ceil(imageBuffer_array.length / bitwidth);
    const rastersize = bitwidth*bitheight;
    // fill the tail gap
    if(imageBuffer_array.length < rastersize) {
      const gap = rastersize - imageBuffer_array.length;
      for ( let g = 0; g < gap; g++) {
        imageBuffer_array.push(0x00);
      }
    }     
  
    let imageBuffer = Buffer.from(imageBuffer_array);

    this.buffer.write([0x1D, 0x76, 0x30, 0x00]);
    this.buffer.write([bitwidth & 0xff]);
    this.buffer.write([bitwidth >> 8]);
    this.buffer.write([bitheight & 0xff]);
    this.buffer.write([bitheight >> 8]);

    // append data
    this.buffer.write(imageBuffer);

    return this;
  }

  public isBlack(pixel: {a: number, r: number, g: number, b: number}): boolean {
    if(!pixel) {
      return false;
    }
    if (pixel.a && pixel.a < 128) { // checking transparency
      return false;
    }
    const intensity = (pixel.r + pixel.g + pixel.b) / 3;
    return intensity < 128;
  }

  public printText(text: string, encoding: string = this.textEncoding): BufferBuilder {        
    this.buffer.write(iconv.encode(text, encoding), 'ascii');
    return this;
  }

  public printTextLine(text: string): BufferBuilder {
    return this.printText(text).breakLine();
  }

  public breakLine(lines: number = 0): BufferBuilder {
    this.buffer.write(Command.ESC_d(lines));
    return this;
  }

  public lineFeed(): BufferBuilder {
    this.buffer.write(Command.LF);
    return this;
  }

  public transmitStatus(statusType: STATUS_TYPE): BufferBuilder {
    this.buffer.write(Command.DLE_EOT(statusType));
    return this;
  }

  public build(): number[] {
    if (this.defaultSettings) {
      this.lineFeed();
      this.buffer.write(Command.ESC_init);
    }

    return this.buffer.flush();
  }

  /**
   * Register Paper Cut Action
   * @return BufferBuilder
   */
  public paperCut(): BufferBuilder {
    this.buffer.write(Command.GS_v(1));
    return this;
  }


  /**
   * Register Play Beep Action
   * @return BufferBuilder
   */
  public playBeep(): BufferBuilder {
    this.buffer.write([Command.ESC, 0x42, 0x02, 0x02]);
    return this;
  }  


}

export enum UNDERLINE_MODE {
  ONE_POINT_OF_COARSE = 49,
  TWO_POINTS_OF_COARSE = 50
}

export enum ALIGNMENT {
  LEFT = 48,
  CENTER = 49,
  RIGHT = 50
}

export enum BARCODE_SYSTEM {
  UPC_A = 65,
  UPC_E = 66,
  EAN_13 = 67,
  EAN_8 = 68,
  CODE_39 = 69,
  ITF = 70,
  CODABAR = 71,
  CODE_93 = 72,
  CODE_128 = 73
}

export enum BARCODE_WIDTH {
  DOT_250 = 2,
  DOT_375 = 3,
  DOT_560 = 4,
  DOT_625 = 5,
  DOT_750 = 6
}

export enum BARCODE_LABEL_FONT {
  FONT_A = 48,
  FONT_B = 49
}

export enum BARCODE_LABEL_POSITION {
  NOT_PRINT = 48,
  ABOVE = 49,
  BOTTOM = 50,
  ABOVE_BOTTOM = 51
}

export enum QR_EC_LEVEL {
  L = 0,
  M = 1,
  Q = 2,
  H = 3
}

export enum BITMAP_SCALE {
  NORMAL = 48,
  DOUBLE_WIDTH = 49,
  DOUBLE_HEIGHT = 50,
  FOUR_TIMES = 51
}

export enum STATUS_TYPE {
  PRINTER_STATUS = 1,
  OFFLINE_STATUS = 2,
  ERROR_STATUS = 3,
  PAPER_ROLL_SENSOR_STATUS = 4
}
