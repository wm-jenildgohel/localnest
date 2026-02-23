import 'dart:convert';
import 'dart:io';

import 'version.dart';

class VersionCheckResult {
  const VersionCheckResult({
    required this.currentVersion,
    required this.latestVersion,
    required this.hasUpdate,
  });

  final String currentVersion;
  final String latestVersion;
  final bool hasUpdate;
}

Future<VersionCheckResult?> checkForLocalNestUpdate() async {
  final latest = await _fetchLatestVersionFromPubDev();
  if (latest == null) return null;
  return VersionCheckResult(
    currentVersion: localnestVersion,
    latestVersion: latest,
    hasUpdate: compareSemver(latest, localnestVersion) > 0,
  );
}

Future<bool> runSelfUpgrade() async {
  try {
    final result = await Process.run('dart', [
      'pub',
      'global',
      'activate',
      'localnest',
    ]);
    return result.exitCode == 0;
  } on ProcessException {
    return false;
  }
}

Future<String?> _fetchLatestVersionFromPubDev() async {
  final client = HttpClient();
  try {
    final req = await client.getUrl(
      Uri.parse('https://pub.dev/api/packages/localnest'),
    );
    req.headers.set(HttpHeaders.acceptHeader, 'application/json');
    final res = await req.close();
    if (res.statusCode != 200) return null;

    final body = await utf8.decoder.bind(res).join();
    final decoded = jsonDecode(body);
    if (decoded is! Map<String, dynamic>) return null;
    final latest = decoded['latest'];
    if (latest is! Map<String, dynamic>) return null;
    final version = latest['version']?.toString().trim() ?? '';
    return version.isEmpty ? null : version;
  } catch (_) {
    return null;
  } finally {
    client.close(force: true);
  }
}

int compareSemver(String a, String b) {
  final pa = _parseSemver(a);
  final pb = _parseSemver(b);
  if (pa == null || pb == null) return a.compareTo(b);

  final coreCmp = _compareCore(pa.core, pb.core);
  if (coreCmp != 0) return coreCmp;

  if (pa.prerelease == null && pb.prerelease == null) return 0;
  if (pa.prerelease == null) return 1;
  if (pb.prerelease == null) return -1;
  return _comparePrerelease(pa.prerelease!, pb.prerelease!);
}

({List<int> core, String? prerelease})? _parseSemver(String input) {
  final m = RegExp(
    r'^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$',
  ).firstMatch(input.trim());
  if (m == null) return null;

  return (
    core: [
      int.parse(m.group(1)!),
      int.parse(m.group(2)!),
      int.parse(m.group(3)!),
    ],
    prerelease: m.group(4),
  );
}

int _compareCore(List<int> a, List<int> b) {
  for (var i = 0; i < 3; i++) {
    if (a[i] != b[i]) return a[i].compareTo(b[i]);
  }
  return 0;
}

int _comparePrerelease(String a, String b) {
  final as = a.split('.');
  final bs = b.split('.');
  final maxLen = as.length > bs.length ? as.length : bs.length;

  for (var i = 0; i < maxLen; i++) {
    if (i >= as.length) return -1;
    if (i >= bs.length) return 1;

    final ai = as[i];
    final bi = bs[i];
    final an = int.tryParse(ai);
    final bn = int.tryParse(bi);

    if (an != null && bn != null) {
      if (an != bn) return an.compareTo(bn);
      continue;
    }
    if (an != null && bn == null) return -1;
    if (an == null && bn != null) return 1;

    final cmp = ai.compareTo(bi);
    if (cmp != 0) return cmp;
  }
  return 0;
}
