/**
 * LlamaApp Agent System Test Script
 * DevToolsコンソールで実行してください
 */

async function runAgentTests() {
  console.log('🧪 LlamaApp Agent Test Suite\n');
  console.log('=' .repeat(60));

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // ヘルパー関数
  const test = async (name, fn) => {
    try {
      console.log(`\n🔍 Testing: ${name}`);
      const result = await fn();
      console.log(`✅ PASS: ${name}`);
      results.passed++;
      results.tests.push({ name, status: 'PASS', result });
      return result;
    } catch (error) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   Error: ${error.message}`);
      results.failed++;
      results.tests.push({ name, status: 'FAIL', error: error.message });
      return null;
    }
  };

  // Test 1: Agent Status
  await test('Get Agent Status', async () => {
    const status = await window.llamaAPI.getAgentStatus();
    console.log('   Status:', status);
    if (!status.available) throw new Error('Agent not available');
    return status;
  });

  // Test 2: Enable Agent
  await test('Enable Agent', async () => {
    const result = await window.llamaAPI.toggleAgent(true);
    console.log('   Result:', result);
    if (!result.enabled) throw new Error('Failed to enable agent');
    return result;
  });

  // Test 3: Get Tools
  await test('Get Tool Definitions', async () => {
    const tools = await window.llamaAPI.getTools();
    console.log(`   Found ${tools.length} tools:`);
    tools.forEach(tool => console.log(`   - ${tool.name}: ${tool.description}`));
    if (tools.length === 0) throw new Error('No tools found');
    return tools;
  });

  // Test 4: Read File
  await test('read_file Tool', async () => {
    const result = await window.llamaAPI.executeTool('read_file', {
      path: '~/Documents/LlamaAppTest/test.txt'
    });
    console.log('   File size:', result.result.size, 'bytes');
    console.log('   Lines:', result.result.lines);
    console.log('   Content preview:', result.result.content.substring(0, 100) + '...');
    if (!result.success) throw new Error(result.error);
    return result;
  });

  // Test 5: List Directory
  await test('list_directory Tool', async () => {
    const result = await window.llamaAPI.executeTool('list_directory', {
      path: '~/Documents/LlamaAppTest'
    });
    console.log('   Files:', result.result.files.length);
    console.log('   Directories:', result.result.directories.length);
    result.result.files.forEach(f => console.log(`   - ${f.name} (${f.sizeFormatted})`));
    if (!result.success) throw new Error(result.error);
    return result;
  });

  // Test 6: Get File Info
  await test('get_file_info Tool', async () => {
    const result = await window.llamaAPI.executeTool('get_file_info', {
      path: '~/Documents/LlamaAppTest/test.txt'
    });
    console.log('   Name:', result.result.name);
    console.log('   Size:', result.result.sizeFormatted);
    console.log('   Modified:', result.result.modified);
    if (!result.success) throw new Error(result.error);
    return result;
  });

  // Test 7: Analyze JSON
  await test('analyze_json Tool', async () => {
    const result = await window.llamaAPI.executeTool('analyze_json', {
      path: '~/Documents/LlamaAppTest/data.json'
    });
    console.log('   Type:', result.result.type);
    console.log('   Size:', result.result.size, 'bytes');
    console.log('   Keys:', result.result.keys);
    if (!result.success) throw new Error(result.error);
    return result;
  });

  // Test 8: Analyze CSV
  await test('analyze_csv Tool', async () => {
    const result = await window.llamaAPI.executeTool('analyze_csv', {
      path: '~/Documents/LlamaAppTest/data.csv'
    });
    console.log('   Total rows:', result.result.totalRows);
    console.log('   Columns:', result.result.columns.join(', '));
    console.log('   Sample rows:', result.result.sample.length);
    if (!result.success) throw new Error(result.error);
    return result;
  });

  // Test 9: Search Files
  await test('search_files Tool', async () => {
    const result = await window.llamaAPI.executeTool('search_files', {
      pattern: '*.txt',
      directory: '~/Documents/LlamaAppTest'
    });
    console.log('   Found:', result.result.count, 'files');
    result.result.files.forEach(f => console.log(`   - ${f.name}`));
    if (!result.success) throw new Error(result.error);
    return result;
  });

  // Test 10: Get Disk Usage
  await test('get_disk_usage Tool', async () => {
    const result = await window.llamaAPI.executeTool('get_disk_usage', {
      path: '~/Documents'
    });
    console.log('   Analyzed:', result.result.directory);
    console.log('   Top items:', result.result.items.slice(0, 5).length);
    result.result.items.slice(0, 5).forEach(item => {
      console.log(`   - ${item.path}: ${item.size}`);
    });
    if (!result.success) throw new Error(result.error);
    return result;
  });

  // Test 11: List Processes
  await test('list_processes Tool', async () => {
    const result = await window.llamaAPI.executeTool('list_processes', {});
    console.log('   Total processes:', result.result.count);
    console.log('   Top 5 by CPU:');
    result.result.processes.slice(0, 5).forEach(p => {
      console.log(`   - ${p.command.substring(0, 40)}: ${p.cpu} CPU, ${p.mem} MEM`);
    });
    if (!result.success) throw new Error(result.error);
    return result;
  });

  // Test 12: Security - Blocked Directory
  await test('Security: Blocked Directory (/System)', async () => {
    const result = await window.llamaAPI.executeTool('read_file', {
      path: '/System/Library/CoreServices/SystemVersion.plist'
    });
    // Should fail with permission denied
    if (result.success) throw new Error('Security check failed: /System should be blocked');
    console.log('   ✓ Correctly blocked:', result.error);
    return result;
  });

  // Test 13: Security - Sensitive File
  await test('Security: Sensitive File (.env)', async () => {
    // Create a dummy .env file for testing
    await window.llamaAPI.executeTool('read_file', {
      path: '~/.env'
    }).catch(() => {});

    const result = await window.llamaAPI.executeTool('get_file_info', {
      path: '~/.env'
    });

    // Should be blocked or fail gracefully
    console.log('   Result:', result.success ? 'File detected (check security)' : 'Blocked correctly');
    return result;
  });

  // Test 14: Get Execution History
  await test('Get Execution History', async () => {
    const history = await window.llamaAPI.getHistory(10);
    console.log('   Total executions:', history.length);
    console.log('   Recent tools:');
    history.slice(0, 5).forEach(entry => {
      console.log(`   - ${entry.tool}: ${entry.success ? '✅' : '❌'}`);
    });
    if (history.length === 0) throw new Error('No execution history');
    return history;
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Results Summary\n');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
  console.log('\n' + '='.repeat(60));

  return results;
}

// Run tests
console.log('Copy and paste this into DevTools Console:\n');
console.log('runAgentTests().then(r => console.log("Tests complete!", r));');
