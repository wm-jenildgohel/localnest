import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'version.dart';

abstract class ToolExecutor {
  Map<String, dynamic> toolsListPayload();
  Future<Map<String, dynamic>> runTool(String name, Map<String, dynamic> args);
}

class McpStdioServer {
  McpStdioServer({
    required ToolExecutor executor,
    this.serverName = 'localnest',
    this.serverVersion = localnestVersion,
    Stream<List<int>>? input,
    IOSink? outSink,
    IOSink? errSink,
  }) : _executor = executor,
       _input = input ?? stdin,
       _out = outSink ?? stdout,
       _err = errSink ?? stderr;

  final ToolExecutor _executor;
  final String serverName;
  final String serverVersion;
  final Stream<List<int>> _input;
  final IOSink _out;
  final IOSink _err;

  final List<int> _buffer = <int>[];
  static const _maxHeaderBytes = 16 * 1024;
  static const _maxBodyBytes = 2 * 1024 * 1024;
  static const _maxBufferBytes = 3 * 1024 * 1024;
  bool _initialized = false;
  static const _supportedProtocolVersions = <String>[
    '2025-11-05',
    '2025-03-26',
    '2024-11-05',
  ];

  Future<void> serve() async {
    await for (final chunk in _input) {
      _buffer.addAll(chunk);
      if (_buffer.length > _maxBufferBytes) {
        _err.writeln('localnest: input buffer exceeded max size, resetting');
        _buffer.clear();
        continue;
      }
      await _drain();
    }
  }

  Future<void> _drain() async {
    while (true) {
      final headerEnd = _indexOf(_buffer, const [13, 10, 13, 10]); // \r\n\r\n
      if (headerEnd < 0) {
        if (_buffer.length > _maxHeaderBytes) {
          _err.writeln('localnest: header too large, dropping buffer');
          _buffer.clear();
        }
        return;
      }

      if (headerEnd > _maxHeaderBytes) {
        _err.writeln('localnest: header exceeded max size, dropping frame');
        _buffer.removeRange(0, headerEnd + 4);
        continue;
      }

      final headerBytes = _buffer.sublist(0, headerEnd);
      final headerText = ascii.decode(headerBytes, allowInvalid: true);
      final contentLength = _parseContentLength(headerText);
      if (contentLength <= 0) {
        _buffer.removeRange(0, headerEnd + 4);
        continue;
      }
      if (contentLength > _maxBodyBytes) {
        _err.writeln(
          'localnest: body too large ($contentLength), dropping frame',
        );
        final bodyStart = headerEnd + 4;
        if (_buffer.length >= bodyStart + contentLength) {
          _buffer.removeRange(0, bodyStart + contentLength);
        } else {
          _buffer.clear();
        }
        continue;
      }

      final bodyStart = headerEnd + 4;
      if (_buffer.length < bodyStart + contentLength) return;

      final bodyBytes = _buffer.sublist(bodyStart, bodyStart + contentLength);
      _buffer.removeRange(0, bodyStart + contentLength);

      Map<String, dynamic>? message;
      try {
        message = jsonDecode(utf8.decode(bodyBytes)) as Map<String, dynamic>;
      } catch (e) {
        _err.writeln('localnest: invalid JSON message: $e');
        await _sendError(null, -32700, 'Parse error', allowNullId: true);
      }

      if (message != null) {
        await _handle(message);
      }
    }
  }

  Future<void> _handle(Map<String, dynamic> message) async {
    final method = message['method']?.toString();
    final id = message['id'];
    final params = (message['params'] is Map<String, dynamic>)
        ? message['params'] as Map<String, dynamic>
        : <String, dynamic>{};
    final isNotification = !message.containsKey('id');

    if (method == null) {
      await _sendError(
        id,
        -32600,
        'Invalid Request: missing method',
        allowNullId: true,
      );
      return;
    }

    try {
      switch (method) {
        case 'initialize':
          final requestedVersion =
              params['protocolVersion']?.toString().trim() ?? '';
          if (requestedVersion.isEmpty) {
            await _sendError(
              id,
              -32602,
              'Invalid params: protocolVersion is required',
            );
            return;
          }
          final negotiated =
              _supportedProtocolVersions.contains(requestedVersion)
              ? requestedVersion
              : _supportedProtocolVersions.first;
          _initialized = true;
          await _sendResult(id, {
            'protocolVersion': negotiated,
            'capabilities': {
              'tools': {'listChanged': false},
            },
            'serverInfo': {'name': serverName, 'version': serverVersion},
          });
          return;
        case 'notifications/initialized':
          return;
        case 'ping':
          await _sendResult(id, <String, dynamic>{});
          return;
        case 'tools/list':
          if (!_initialized) {
            await _sendError(id, -32002, 'Server not initialized');
            return;
          }
          await _sendResult(id, _executor.toolsListPayload());
          return;
        case 'tools/call':
          if (!_initialized) {
            await _sendError(id, -32002, 'Server not initialized');
            return;
          }
          final name = params['name']?.toString() ?? '';
          final args = (params['arguments'] is Map<String, dynamic>)
              ? params['arguments'] as Map<String, dynamic>
              : <String, dynamic>{};
          if (name.isEmpty) {
            await _sendResult(id, {
              'isError': true,
              'content': [
                {'type': 'text', 'text': 'tools/call requires name'},
              ],
            });
            return;
          }
          final out = await _executor.runTool(name, args);
          await _sendResult(id, out);
          return;
        default:
          await _sendError(id, -32601, 'Method not found: $method');
      }
    } catch (e, st) {
      _err.writeln('localnest: unhandled request error: $e');
      _err.writeln(st);
      if (!isNotification) {
        await _sendError(id, -32603, 'Internal error');
      }
    }
  }

  Future<void> _sendResult(dynamic id, Map<String, dynamic> result) async {
    if (id == null) return;
    await _send({'jsonrpc': '2.0', 'id': id, 'result': result});
  }

  Future<void> _sendError(
    dynamic id,
    int code,
    String message, {
    bool allowNullId = false,
  }) async {
    if (id == null && !allowNullId) return;
    await _send({
      'jsonrpc': '2.0',
      'id': id,
      'error': {'code': code, 'message': message},
    });
  }

  Future<void> _send(Map<String, dynamic> payload) async {
    final body = utf8.encode(jsonEncode(payload));
    final header = ascii.encode('Content-Length: ${body.length}\r\n\r\n');
    _out.add(header);
    _out.add(body);
    await _out.flush();
  }

  int _parseContentLength(String headerText) {
    for (final line in const LineSplitter().convert(headerText)) {
      final parts = line.split(':');
      if (parts.length != 2) continue;
      if (parts[0].trim().toLowerCase() == 'content-length') {
        return int.tryParse(parts[1].trim()) ?? 0;
      }
    }
    return 0;
  }

  int _indexOf(List<int> bytes, List<int> pattern) {
    if (pattern.isEmpty || bytes.length < pattern.length) return -1;
    for (var i = 0; i <= bytes.length - pattern.length; i++) {
      var ok = true;
      for (var j = 0; j < pattern.length; j++) {
        if (bytes[i + j] != pattern[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  }
}
