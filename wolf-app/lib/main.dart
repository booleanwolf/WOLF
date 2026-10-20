import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

/// Wolf for Android: the Wolf web app in a web view, so the phone always runs
/// the same version as the server. The server address is asked once and kept.
void main() => runApp(const WolfApp());

const _serverKey = 'server';
// The hosted Wolf on DigitalOcean. Build with --dart-define=WOLF_SERVER=https://... to point elsewhere.
const defaultServer = String.fromEnvironment('WOLF_SERVER', defaultValue: 'https://162-243-255-182.sslip.io');
const _green = Color(0xFF2E6A57);

class WolfApp extends StatelessWidget {
  const WolfApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Wolf',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: _green, useMaterial3: true),
      darkTheme: ThemeData(colorSchemeSeed: _green, brightness: Brightness.dark, useMaterial3: true),
      home: const Start(),
    );
  }
}

/// Opens the saved server, or the hosted one; asks for an address only after "Change server".
class Start extends StatefulWidget {
  const Start({super.key});

  @override
  State<Start> createState() => _StartState();
}

class _StartState extends State<Start> {
  String? _server;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) => setState(() {
          final saved = p.getString(_serverKey);
          // Builds before HTTPS used the bare IP; that address now only redirects.
          _server = (saved == 'http://162.243.255.182' ? defaultServer : saved) ?? (p.getBool('askServer') == true ? null : defaultServer);
          _loaded = true;
        }));
  }

  Future<void> _setServer(String? url) async {
    final p = await SharedPreferences.getInstance();
    if (url == null) {
      await p.remove(_serverKey);
      await p.setBool('askServer', true);
    } else {
      await p.setString(_serverKey, url);
      await p.remove('askServer');
    }
    setState(() => _server = url);
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) return const Scaffold();
    final server = _server;
    if (server == null) return SetupPage(onSaved: _setServer);
    return WolfPage(key: ValueKey(server), server: server, onChangeServer: () => _setServer(null));
  }
}

/// 'wolf.example.com' -> 'https://wolf.example.com'; keeps an explicit http:// for a local server.
String normalise(String input) {
  var s = input.trim();
  if (s.isEmpty) return s;
  if (!s.contains('://')) s = 'https://$s';
  return s.replaceAll(RegExp(r'/+$'), '');
}

class SetupPage extends StatefulWidget {
  const SetupPage({super.key, required this.onSaved});

  final Future<void> Function(String) onSaved;

  @override
  State<SetupPage> createState() => _SetupPageState();
}

class _SetupPageState extends State<SetupPage> {
  final _controller = TextEditingController();
  String? _error;
  bool _busy = false;

  /// Checks the address answers like a Wolf server (GET /healthz) before saving it.
  Future<void> _connect() async {
    final url = normalise(_controller.text);
    final uri = Uri.tryParse(url);
    if (uri == null || !uri.hasAuthority || !(uri.scheme == 'http' || uri.scheme == 'https')) {
      setState(() => _error = 'Enter the address of your Wolf server, like wolf.example.com');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 8);
    try {
      final req = await client.getUrl(uri.resolve('/healthz'));
      final res = await req.close().timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) throw HttpException('status ${res.statusCode}');
      await widget.onSaved(url);
    } catch (_) {
      setState(() => _error = 'Could not reach Wolf at $url. Check the address and your connection.');
    } finally {
      client.close(force: true);
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: Image.asset('assets/wolf.png', width: 64, height: 64),
                  ),
                  const SizedBox(height: 20),
                  Text('Connect to Wolf', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Text('Enter the address you open Wolf at in your browser.',
                      style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  const SizedBox(height: 24),
                  TextField(
                    controller: _controller,
                    autofocus: true,
                    keyboardType: TextInputType.url,
                    autocorrect: false,
                    textInputAction: TextInputAction.go,
                    onSubmitted: (_) => _busy ? null : _connect(),
                    decoration: InputDecoration(
                      labelText: 'Server address',
                      hintText: 'wolf.example.com',
                      errorText: _error,
                      errorMaxLines: 3,
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _busy ? null : _connect,
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                    child: _busy
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Connect'),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: _busy ? null : () => widget.onSaved(defaultServer),
                    child: const Text('Use the hosted Wolf'),
                  ),
                  Text('For a server on your own network, include http:// and the port, e.g. http://192.168.0.10:8081',
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class WolfPage extends StatefulWidget {
  const WolfPage({super.key, required this.server, required this.onChangeServer});

  final String server;
  final VoidCallback onChangeServer;

  @override
  State<WolfPage> createState() => _WolfPageState();
}

class _WolfPageState extends State<WolfPage> {
  late final WebViewController _web;
  late final Uri _home = Uri.parse(widget.server);
  int _progress = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) => setState(() => _progress = p),
        onPageStarted: (_) => setState(() => _error = null),
        onNavigationRequest: _onNavigate,
        onWebResourceError: (e) {
          // Only a failed page load counts; a failed image or API call is the web app's business.
          if (e.isForMainFrame ?? true) setState(() => _error = e.description);
        },
      ));
    _setup();
  }

  Future<void> _setup() async {
    // The web app hides its "Download App" button when it sees this.
    final ua = await _web.getUserAgent();
    await _web.setUserAgent('${ua ?? ''} WolfApp/1.0');
    final android = _web.platform;
    if (android is AndroidWebViewController) {
      await android.setOnShowFileSelector(_pickFiles);
      await android.setMediaPlaybackRequiresUserGesture(false);
    }
    await _web.loadRequest(_home);
  }

  /// Links to other sites (bKash, papers, contest pages, WhatsApp) open outside the app.
  Future<NavigationDecision> _onNavigate(NavigationRequest req) async {
    final uri = Uri.tryParse(req.url);
    if (uri == null) return NavigationDecision.prevent;
    final sameSite = uri.scheme == _home.scheme && uri.host == _home.host && uri.port == _home.port;
    if (sameSite || uri.scheme == 'about' || uri.scheme == 'blob' || uri.scheme == 'data') {
      return NavigationDecision.navigate;
    }
    unawaited(launchUrl(uri, mode: LaunchMode.externalApplication));
    return NavigationDecision.prevent;
  }

  /// Answers the web page's <input type="file"> with the system file picker.
  Future<List<String>> _pickFiles(FileSelectorParams params) async {
    final types = params.acceptTypes.where((t) => t.isNotEmpty).toList();
    final imagesOnly = types.isNotEmpty && types.every((t) => t.startsWith('image/'));
    try {
      final files = await FilePicker.pickFiles(type: imagesOnly ? FileType.image : FileType.any);
      final uris = files.map((f) => f.uri.toString()).toList();
      return params.mode == FileSelectorMode.openMultiple ? uris : uris.take(1).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _onBack() async {
    if (await _web.canGoBack()) {
      await _web.goBack();
      return;
    }
    if (!mounted) return;
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.refresh),
              title: const Text('Reload'),
              onTap: () => Navigator.pop(ctx, 'reload'),
            ),
            ListTile(
              leading: const Icon(Icons.dns_outlined),
              title: const Text('Change server'),
              subtitle: Text(widget.server),
              onTap: () => Navigator.pop(ctx, 'server'),
            ),
            ListTile(
              leading: const Icon(Icons.logout),
              title: const Text('Close Wolf'),
              onTap: () => Navigator.pop(ctx, 'exit'),
            ),
          ],
        ),
      ),
    );
    switch (choice) {
      case 'reload':
        await _web.reload();
      case 'server':
        widget.onChangeServer();
      case 'exit':
        await SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _onBack();
      },
      child: Scaffold(
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _web),
              if (_progress < 100 && _error == null)
                LinearProgressIndicator(value: _progress / 100, minHeight: 2),
              if (_error != null)
                Positioned.fill(
                  child: ColoredBox(
                    color: theme.colorScheme.surface,
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.cloud_off, size: 48, color: theme.colorScheme.outline),
                            const SizedBox(height: 12),
                            Text("Can't reach Wolf", style: theme.textTheme.titleLarge),
                            const SizedBox(height: 6),
                            Text('Check your connection, then try again.\n${widget.server}',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
                            const SizedBox(height: 20),
                            FilledButton.icon(
                              onPressed: () {
                                setState(() => _error = null);
                                _web.loadRequest(_home);
                              },
                              icon: const Icon(Icons.refresh),
                              label: const Text('Try again'),
                            ),
                            TextButton(onPressed: widget.onChangeServer, child: const Text('Change server')),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
