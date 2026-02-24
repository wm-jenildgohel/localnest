import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:localnest/src/mcp_stdio_server.dart';
import 'package:test/test.dart';

void main() {
  group('McpStdioServer', () {
    test('accepts tools/list before initialize via compatibility mode', () async {
      final response = await _runSingle(
        _jsonRpcRequest(id: 1, method: 'tools/list', params: {}),
      );

      expect(response['result'], isA<Map>());
      expect((response['result']['tools'] as List).isNotEmpty, isTrue);
    });

    test('accepts initialize without protocolVersion', () async {
      final response = await _runSingle(
        _jsonRpcRequest(id: 1, method: 'initialize', params: {}),
      );

      expect(response['result']['protocolVersion'], '2025-11-05');
    });

    test('returns parse error for malformed json body', () async {
      final responses = await _runRaw([_frameBytes('{')]);
      expect(responses, hasLength(1));
      expect(responses.first['error']['code'], -32700);
      expect(responses.first['id'], isNull);
    });

    test('returns invalid request for non-object json body', () async {
      final responses = await _runRaw([_frameBytes('[]')]);
      expect(responses, hasLength(1));
      expect(responses.first['error']['code'], -32600);
      expect(responses.first['id'], isNull);
    });

    test('returns invalid request for non-2.0 jsonrpc value', () async {
      final responses = await _runRaw([
        _frameBytes(
          jsonEncode({
            'jsonrpc': '1.0',
            'id': 1,
            'method': 'initialize',
            'params': <String, dynamic>{},
          }),
        ),
      ]);
      expect(responses, hasLength(1));
      expect(responses.first['error']['code'], -32600);
      expect(responses.first['id'], 1);
    });

    test('accepts initialize when jsonrpc field is omitted', () async {
      final responses = await _runRaw([
        _frameBytes(
          jsonEncode({
            'id': 1,
            'method': 'initialize',
            'params': <String, dynamic>{},
          }),
        ),
      ]);
      expect(responses, hasLength(1));
      expect(responses.first['result']['protocolVersion'], '2025-11-05');
    });

    test(
      'negotiates to supported protocolVersion when client sends unknown',
      () async {
        final response = await _runSingle(
          _jsonRpcRequest(
            id: 1,
            method: 'initialize',
            params: {'protocolVersion': '2099-01-01'},
          ),
        );

        expect(response['result']['protocolVersion'], '2025-11-05');
      },
    );

    test('supports ping before initialize', () async {
      final response = await _runSingle(
        _jsonRpcRequest(id: 1, method: 'ping', params: {}),
      );

      expect(response['result'], isA<Map>());
      expect((response['result'] as Map).isEmpty, isTrue);
    });

    test('returns empty ping result after initialize', () async {
      final responses = await _runRaw([
        _frameBytes(
          _jsonRpcRequest(
            id: 1,
            method: 'initialize',
            params: {'protocolVersion': '2025-11-05'},
          ),
        ),
        _frameBytes(_jsonRpcRequest(id: 2, method: 'ping', params: {})),
      ]);

      expect(responses, hasLength(2));
      expect(responses[1]['result'], isA<Map>());
      expect((responses[1]['result'] as Map).isEmpty, isTrue);
    });

    test('converts unhandled tool exception into internal error', () async {
      final responses = await _runRaw([
        _frameBytes(
          _jsonRpcRequest(
            id: 1,
            method: 'initialize',
            params: {'protocolVersion': '2025-11-05'},
          ),
        ),
        _frameBytes(
          _jsonRpcRequest(
            id: 2,
            method: 'tools/call',
            params: {'name': 'boom', 'arguments': <String, dynamic>{}},
          ),
        ),
      ], executor: _ThrowingExecutor());

      expect(responses, hasLength(2));
      expect(responses[1]['error']['code'], -32603);
      expect(responses[1]['error']['message'], 'Internal error');
    });

    test('tools/call accepts input alias for arguments', () async {
      final responses = await _runRaw([
        _frameBytes(
          _jsonRpcRequest(
            id: 1,
            method: 'initialize',
            params: {'protocolVersion': '2025-11-05'},
          ),
        ),
        _frameBytes(
          _jsonRpcRequest(
            id: 2,
            method: 'tools/call',
            params: {
              'name': 'echo',
              'input': <String, dynamic>{'from': 'input'},
            },
          ),
        ),
      ]);

      expect(responses, hasLength(2));
      expect(responses[1]['result']['isError'], isFalse);
    });

    test('parses frame headers that use LF delimiter', () async {
      final body = _jsonRpcRequest(
        id: 1,
        method: 'initialize',
        params: {'protocolVersion': '2025-11-05'},
      );
      final payload = utf8.encode(body);
      final frame = ascii.encode('Content-Length: ${payload.length}\n\n') + payload;
      final responses = await _runRaw([frame]);

      expect(responses, hasLength(1));
      expect(responses.first['result']['protocolVersion'], '2025-11-05');
    });
  });
}

Future<Map<String, dynamic>> _runSingle(String request) async {
  final responses = await _runRaw([_frameBytes(request)]);
  expect(responses, hasLength(1));
  return responses.first;
}

Future<List<Map<String, dynamic>>> _runRaw(
  List<List<int>> frames, {
  ToolExecutor? executor,
}) async {
  final outController = StreamController<List<int>>();
  final errController = StreamController<List<int>>();
  final outBuffer = BytesBuilder(copy: false);
  final errBuffer = BytesBuilder(copy: false);

  final outSub = outController.stream.listen(outBuffer.add);
  final errSub = errController.stream.listen(errBuffer.add);
  final outSink = IOSink(outController.sink);
  final errSink = IOSink(errController.sink);

  final input = Stream<List<int>>.fromIterable(frames);

  final server = McpStdioServer(
    executor: executor ?? _OkExecutor(),
    input: input,
    outSink: outSink,
    errSink: errSink,
  );

  await server.serve();
  await outSink.close();
  await errSink.close();
  await outSub.cancel();
  await errSub.cancel();

  return _decodeResponses(utf8.decode(outBuffer.takeBytes()));
}

String _jsonRpcRequest({
  required int id,
  required String method,
  required Map<String, dynamic> params,
}) {
  return jsonEncode({
    'jsonrpc': '2.0',
    'id': id,
    'method': method,
    'params': params,
  });
}

List<int> _frameBytes(String body) {
  final payload = utf8.encode(body);
  return ascii.encode('Content-Length: ${payload.length}\r\n\r\n') + payload;
}

List<Map<String, dynamic>> _decodeResponses(String text) {
  final out = <Map<String, dynamic>>[];
  var cursor = 0;

  while (cursor < text.length) {
    final headerEnd = text.indexOf('\r\n\r\n', cursor);
    if (headerEnd < 0) break;
    final header = text.substring(cursor, headerEnd);
    final contentLengthLine = header
        .split('\r\n')
        .firstWhere((line) => line.toLowerCase().startsWith('content-length'));
    final size = int.parse(contentLengthLine.split(':').last.trim());
    final bodyStart = headerEnd + 4;
    final bodyEnd = bodyStart + size;
    final body = text.substring(bodyStart, bodyEnd);
    out.add(jsonDecode(body) as Map<String, dynamic>);
    cursor = bodyEnd;
  }

  return out;
}

class _OkExecutor implements ToolExecutor {
  @override
  Future<Map<String, dynamic>> runTool(
    String name,
    Map<String, dynamic> args,
  ) async {
    return {
      'isError': false,
      'structuredContent': {'name': name},
      'content': [
        {'type': 'text', 'text': name},
      ],
    };
  }

  @override
  Map<String, dynamic> toolsListPayload() => {
    'tools': [
      {
        'name': 'ok',
        'description': 'ok',
        'inputSchema': {
          'type': 'object',
          'properties': <String, dynamic>{},
          'additionalProperties': false,
        },
      },
    ],
  };
}

class _ThrowingExecutor implements ToolExecutor {
  @override
  Future<Map<String, dynamic>> runTool(
    String name,
    Map<String, dynamic> args,
  ) async {
    throw StateError('boom');
  }

  @override
  Map<String, dynamic> toolsListPayload() => {
    'tools': <Map<String, dynamic>>[],
  };
}
