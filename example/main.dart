import 'package:localnest/localnest.dart';

Future<void> main() async {
  // Minimal example: run setup for a local workspace.
  // Replace with your real path before executing.
  final result = await setupLocalNest(
    projectName: 'workspace',
    projectRoot: '.',
  );

  print('Config generated at: ${result.configPath}');
  print('Project alias: ${result.projectName}');

  // To run server:
  // final server = LocalNestServer(configPath: result.configPath);
  // await server.run();
}
