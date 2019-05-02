import { XMLNode } from '../xml-node';
import { BufferBuilder } from '../buffer-builder';

export default class PlayBeepNode extends XMLNode {

  constructor(node: any) {
    super(node);
  }

  public open(bufferBuilder: BufferBuilder): BufferBuilder {
    return bufferBuilder.playBeep();
  }

  public close(bufferBuilder: BufferBuilder): BufferBuilder {
    return bufferBuilder;
  }

}