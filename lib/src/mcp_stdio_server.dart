import 'dart:async';
import 'dart:convert';
import 'dart:io';

abstract class ToolExecutor {
  Map<String, dynamic> toolsListPayload();
  Future<Map<String, dynamic>> runTool(String name, Map<String, dynamic> args);
}

class McpStdioServer {
  McpStdioServer({
    required ToolExecutor executor,
    this.serverName = 'localnest',
    this.serverVersion = '0.1.0-beta.1',
  }) : _executor = executor;

  final ToolExecutor _executor;
  final String serverName;
  final String serverVersion;

  final List<int> _buffer = <int>[];
  static const _maxHeaderBytes = 16 * 1024;
  static const _maxBodyBytes = 2 * 1024 * 1024;
  static const _maxBufferBytes = 3 * 1024 * 1024;

  Future<void> serve() async {
    await for (final chunk in stdin) {
      _buffer.addAll(chunk);
      if (_buffer.length > _maxBufferBytes) {
        stderr.writeln('localnest: input buffer exceeded max size, resetting');
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
          stderr.writeln('localnest: header too large, dropping buffer');
          _buffer.clear();
        }
        return;
      }

      if (headerEnd > _maxHeaderBytes) {
        stderr.writeln('localnest: header exceeded max size, dropping frame');
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
        stderr.writeln(
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
        stderr.writeln('localnest: invalid JSON message: $e');
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

    if (method == null) {
      await _sendError(id, -32600, 'Invalid Request: missing method');
      return;
    }

    switch (method) {
      case 'initialize':
        await _sendResult(id, {
          'protocolVersion': '2025-11-05',
          'capabilities': {
            'tools': {'listChanged': false},
          },
          'serverInfo': {'name': serverName, 'version': serverVersion},
        });
        return;
      case 'notifications/initialized':
        return;
      case 'ping':
        await _sendResult(id, {'ok': true});
        return;
      case 'tools/list':
        await _sendResult(id, _executor.toolsListPayload());
        return;
      case 'tools/call':
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
  }

  Future<void> _sendResult(dynamic id, Map<String, dynamic> result) async {
    if (id == null) return;
    await _send({'jsonrpc': '2.0', 'id': id, 'result': result});
  }

  Future<void> _sendError(dynamic id, int code, String message) async {
    if (id == null) return;
    await _send({
      'jsonrpc': '2.0',
      'id': id,
      'error': {'code': code, 'message': message},
    });
  }

  Future<void> _send(Map<String, dynamic> payload) async {
    final body = utf8.encode(jsonEncode(payload));
    final header = ascii.encode('Content-Length: ${body.length}\r\n\r\n');
    stdout.add(header);
    stdout.add(body);
    await stdout.flush();
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
