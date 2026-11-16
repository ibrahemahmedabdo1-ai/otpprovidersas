import 'package:flutter/material.dart';
import 'core.dart';

const unavailable = 'Ticketing is not available on this server yet, so no tickets can be shown.';

class Home extends StatelessWidget {
  final Map<String, dynamic> me;
  final Future<void> Function() signOut;
  const Home({super.key, required this.me, required this.signOut});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tickets'), actions: [TextButton(onPressed: signOut, child: const Text('Sign out'))]),
      body: const TicketList(),
    );
  }
}

class TicketList extends StatefulWidget {
  const TicketList({super.key});
  @override
  State<TicketList> createState() => _TicketListState();
}

class _TicketListState extends State<TicketList> {
  List<dynamic>? rows;
  String err = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final r = await Api.get('/v1/support/tickets?status=open');
    if (!mounted) return;
    setState(() { if (r.ok) { rows = r.list; } else { rows = []; err = r.status == 404 ? unavailable : errorText(r); } });
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Support cannot see secrets or change balances.'),
        const SizedBox(height: 12),
        if (err.isNotEmpty) Banner2(err),
        if (rows == null) const LinearProgressIndicator(),
        if (rows != null && rows!.isEmpty && err.isEmpty) const Text('No open tickets.'),
        for (final t in rows ?? <dynamic>[])
          ListTile(title: Text('${(t as Map<String, dynamic>)['subject']}'), subtitle: Text('${t['requester']} - ${t['priority']}'), onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => TicketScreen(id: '${t['id']}')))),
      ]),
    );
  }
}

class TicketScreen extends StatefulWidget {
  final String id;
  const TicketScreen({super.key, required this.id});
  @override
  State<TicketScreen> createState() => _TicketState();
}

class _TicketState extends State<TicketScreen> {
  Map<String, dynamic>? d;
  String err = '';
  bool internal = false;
  bool busy = false;
  final body = TextEditingController();

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final r = await Api.get('/v1/support/tickets/${widget.id}');
    if (!mounted) return;
    setState(() { if (r.ok) { d = r.map; } else { err = r.status == 404 ? unavailable : errorText(r); } });
  }

  Future<void> _post(String path, Object payload) async {
    setState(() { busy = true; err = ''; });
    final r = await Api.post('/v1/support/tickets/${widget.id}/$path', payload);
    if (!mounted) return;
    setState(() { busy = false; if (!r.ok) err = errorText(r); });
    if (r.ok) { body.clear(); await _load(); }
  }

  @override
  Widget build(BuildContext context) {
    final t = d?['ticket'] as Map<String, dynamic>?;
    final msgs = (d?['messages'] as List<dynamic>?) ?? <dynamic>[];
    return Scaffold(
      appBar: AppBar(title: Text(t == null ? 'Ticket' : '${t['subject']}')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (err.isNotEmpty) Banner2(err),
        if (d == null && err.isEmpty) const LinearProgressIndicator(),
        if (t != null) Wrap(spacing: 8, children: [
          OutlinedButton(onPressed: busy ? null : () => _post('assign', <String, dynamic>{}), child: const Text('Assign to me')),
          for (final s in const ['open', 'pending_customer', 'escalated', 'resolved', 'closed']) OutlinedButton(onPressed: busy || t['status'] == s ? null : () => _post('status', {'status': s}), child: Text('Mark ${s.replaceAll('_', ' ')}')),
        ]),
        for (final m in msgs) Card(child: ListTile(title: Text('${(m as Map<String, dynamic>)['author']}${m['kind'] == 'internal' ? '  (internal note)' : ''}'), subtitle: Text('${m['body']}'))),
        if (t != null) ...[
          TextField(controller: body, maxLines: 4, maxLength: 5000, decoration: InputDecoration(labelText: internal ? 'Internal note (customers never see this)' : 'Reply to customer', border: const OutlineInputBorder())),
          CheckboxListTile(contentPadding: EdgeInsets.zero, value: internal, onChanged: (v) => setState(() => internal = v ?? false), title: const Text('Internal note only')),
          const Text('Never ask for or paste passwords, API keys, one-time codes or recovery codes.'),
          FilledButton(onPressed: busy ? null : () => _post(internal ? 'notes' : 'reply', {'body': body.text.trim()}), child: Text(internal ? 'Add note' : 'Send reply')),
        ],
      ]),
    );
  }
}
