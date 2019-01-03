import { createReadStream } from 'fs';
import * as sinon from 'sinon';

import pbtson from '@src/index';
import { expect } from '@test/support/spec-helper';

describe('index#default', () => {
  let outputStub: sinon.SinonStub;

  beforeEach(() => {
    outputStub = sinon.stub(process.stdout, 'write');
  });

  afterEach(() => {
    outputStub.restore();
  });

  it('converts a simple proto', async () => {
    const p = require.resolve('@test/data/simple.proto');
    console.log(p);

    expect(outputStub).to.have.been.calledWith('');
  });
});
