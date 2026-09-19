import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cropRatio, dragCrop, type CropHandle } from '../packages/editor/src/cropGeometry';
const full = {left:0,right:0,top:0,bottom:0};
test('crop presets respect source aspect and preserve the selected center',()=>{
  const square=cropRatio(full,9/16);
  assert.ok(Math.abs((1-square.left-square.right)*16/9/(1-square.top-square.bottom)-1)<1e-9);
  assert.equal(square.left,square.right);
  assert.deepEqual(cropRatio(full,1),full);
});
test('crop dragging keeps boundaries valid and locked ratios intact',()=>{
  for(const ratio of [0,9/16,16/9,1]) for(const handle of ['n','s','e','w','ne','nw','se','sw'] as CropHandle[]) for(const dx of [-2,-0.2,0.2,2]) for(const dy of [-2,-0.2,0.2,2]) {
    const initial=ratio?cropRatio({left:.1,right:.1,top:.1,bottom:.1},ratio):full;
    const result=dragCrop(initial,handle,dx,dy,ratio);
    assert.ok(Object.values(result).every(v=>v>=0&&v<=.99));
    const w=1-result.left-result.right,h=1-result.top-result.bottom;
    assert.ok(w>0&&h>0);
    if(ratio)assert.ok(Math.abs(w/h-ratio)<1e-8);
  }
});
test('moving a crop preserves its size and clamps to source boundaries',()=>{
 const result=dragCrop({left:.2,right:.3,top:.1,bottom:.4},'move',2,-2);
 assert.ok(Math.abs(result.left-.5)<1e-9);
 assert.equal(result.right,0);
 assert.equal(result.top,0);
 assert.equal(result.bottom,.5);
});
