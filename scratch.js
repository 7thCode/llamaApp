const LlamaManager = require('./src/main/llama-manager.js');

async function main() {
  try {
    const manager = new LlamaManager();
    await manager.initialize();
    
    const fs = require('fs');
    const path = require('path');
    const modelsDir = '/Users/oda/Library/Application Support/Llamaapp/models';
    const files = fs.readdirSync(modelsDir);
    
    // Find unsloth_gemma model
    const gemmaModel = files.find(f => f.includes('unsloth_gemma') || f.includes('gemma'));
    if (!gemmaModel) {
      console.log('No gemma model found');
      return;
    }
    
    const modelPath = path.join(modelsDir, gemmaModel);
    console.log('Testing model:', modelPath);
    
    await manager.loadModel(modelPath);
    console.log('Model loaded successfully!');
  } catch (error) {
    console.error('Error during load:', error);
  }
}

main();
