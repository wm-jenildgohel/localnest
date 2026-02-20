import 'dart:io';

/// Runs environment diagnostics for LocalNest runtime requirements.
///
/// Returns `0` for success and non-zero when core dependencies are missing.
Future<int> runLocalNestDoctor({IOSink? outSink}) async {
  final out = outSink ?? stdout;

  out.writeln('LocalNest Doctor');
  out.writeln('OS: ${Platform.operatingSystem}');

  final rg = await _check('rg', const ['--version']);
  final git = await _check('git', const ['--version']);
  final dart = await _check('dart', const ['--version']);

  _printStatus(out, 'dart', dart);
  _printStatus(out, 'git', git);
  _printStatus(out, 'ripgrep (rg)', rg);

  if (!rg.ok) {
    out.writeln('');
    out.writeln('Install ripgrep (recommended for fast search):');
    for (final line in _installHints()) {
      out.writeln('  $line');
    }
    out.writeln(
      'LocalNest will fallback to git grep / Dart scan when rg is unavailable.',
    );
  }

  return (dart.ok && git.ok) ? 0 : 1;
}

List<String> _installHints() {
  switch (Platform.operatingSystem) {
    case 'macos':
      return const ['brew install ripgrep'];
    case 'windows':
      return const [
        'winget install BurntSushi.ripgrep.MSVC',
        'or: choco install ripgrep',
      ];
    case 'linux':
      return const [
        'Ubuntu/Debian: sudo apt-get install ripgrep',
        'Fedora: sudo dnf install ripgrep',
        'Arch: sudo pacman -S ripgrep',
      ];
    default:
      return const [
        'Visit: https://github.com/BurntSushi/ripgrep#installation',
      ];
  }
}

void _printStatus(IOSink out, String name, _CommandCheck status) {
  out.writeln(
    '${status.ok ? 'OK' : 'MISSING'}: $name${status.version == null ? '' : ' (${status.version})'}',
  );
}

Future<_CommandCheck> _check(String cmd, List<String> args) async {
  try {
    final result = await Process.run(cmd, args);
    if (result.exitCode != 0) return const _CommandCheck(false, null);
    final raw = (result.stdout ?? '').toString().trim();
    final lines = raw.split(RegExp(r'\r?\n'));
    final firstLine = lines.isEmpty ? null : lines.first;
    return _CommandCheck(true, firstLine);
  } on ProcessException {
    return const _CommandCheck(false, null);
  }
}

class _CommandCheck {
  const _CommandCheck(this.ok, this.version);

  final bool ok;
  final String? version;
}
