# NostrMQ Local Package Testing

This document describes the comprehensive local testing script for validating the NostrMQ package before submission.

## Overview

The `test-local-package.js` script provides a comprehensive test suite that validates:

- ✅ **Package Structure**: Verifies package.json and dist files
- ✅ **Module Exports**: Tests all expected exports are available
- ✅ **TypeScript Types**: Validates TypeScript definitions
- ✅ **Utility Functions**: Tests helper functions like validation
- ✅ **Proof-of-Work**: Tests PoW mining and validation
- ✅ **Relay Pool**: Tests relay connection management
- ✅ **Configuration**: Tests environment variable handling
- ✅ **Parameter Validation**: Tests input validation
- ✅ **Performance**: Benchmarks PoW mining performance

## Usage

### Prerequisites

1. Ensure the package is built:

   ```bash
   npm run build
   ```

2. Run the comprehensive test suite:
   ```bash
   node test-local-package.js
   ```

### Test Features

- **Mock Mode**: Uses mock keys and data - no real Nostr keys required
- **Timeout Protection**: Each test has configurable timeouts
- **Performance Benchmarking**: Measures and reports timing information
- **Comprehensive Coverage**: Tests all major functionality
- **Clear Output**: Provides detailed pass/fail reporting with timing

### Test Configuration

The script uses these test configurations:

- **PoW Difficulty**: 4 bits (fast for testing)
- **Test Timeout**: 5 seconds per test
- **Mock Keys**: Safe test keys (not real)
- **Mock Relays**: Example relay URLs

### Expected Output

When all tests pass, you'll see:

```
============================================================
🧪 NostrMQ Local Package Testing
============================================================
...
============================================================
✅ 🎉 ALL TESTS PASSED! Package is ready for submission.
============================================================
```

### Test Categories

1. **Package Structure Tests**

   - Validates package.json configuration
   - Checks all required dist files exist

2. **Export Tests**

   - Verifies all expected functions are exported
   - Tests TypeScript type definitions

3. **Utility Function Tests**

   - Tests ID generation
   - Tests pubkey validation
   - Tests relay URL validation

4. **Proof-of-Work Tests**

   - Tests PoW difficulty validation
   - Tests event mining functionality
   - Tests PoW validation functions

5. **Relay Pool Tests**

   - Tests RelayPool instantiation
   - Tests factory functions

6. **Configuration Tests**

   - Tests environment variable handling
   - Tests graceful error handling

7. **Parameter Validation Tests**

   - Tests send function parameter validation
   - Tests receive function parameter validation

8. **Performance Tests**
   - Benchmarks PoW mining performance
   - Ensures reasonable performance thresholds

## Troubleshooting

If tests fail:

1. **Build Issues**: Ensure `npm run build` completed successfully
2. **Missing Files**: Check that all dist files are present
3. **Environment**: The script handles missing environment variables gracefully
4. **Performance**: PoW tests may vary based on system performance

## Integration

This test script can be integrated into CI/CD pipelines:

```bash
# In package.json scripts
"test:package": "node test-local-package.js"

# In CI/CD
npm run build && npm run test:package
```

The script exits with code 0 on success and code 1 on failure, making it suitable for automated testing.
