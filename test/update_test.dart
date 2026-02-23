import 'package:localnest/src/update.dart';
import 'package:test/test.dart';

void main() {
  group('compareSemver', () {
    test('compares core versions', () {
      expect(compareSemver('1.2.0', '1.1.9'), greaterThan(0));
      expect(compareSemver('1.0.0', '1.0.1'), lessThan(0));
      expect(compareSemver('2.0.0', '2.0.0'), 0);
    });

    test('release is greater than prerelease', () {
      expect(compareSemver('1.0.0', '1.0.0-beta.2'), greaterThan(0));
    });

    test('prerelease ordering works', () {
      expect(compareSemver('1.0.0-beta.3', '1.0.0-beta.2'), greaterThan(0));
      expect(compareSemver('1.0.0-alpha.9', '1.0.0-alpha.10'), lessThan(0));
    });
  });
}
