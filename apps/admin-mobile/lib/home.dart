import 'package:flutter/material.dart';
import 'core.dart';
import 'more.dart';

class Home extends StatefulWidget {
  final Map<String, dynamic> me;
  final Future<void> Function() signOut;
  const Home({super.key, required this.me, required this.signOut});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  int tab = 0;
  bool get isSuper => widget.me['role'] == 'super_admin';
  String get myId => '${widget.me['id'] ?? ''}';

  List<(String, IconData, Widget)> get sections => [
    ('Deposits', Icons.payments_outlined, DepositsTab(isSuper: isSuper)),
    if (isSuper) ('Approvals', Icons.verified_outlined, const ApprovalsTab()),
    ('Users', Icons.people_outline, UsersTab(isSuper: isSuper, myId: myId)),
    if (isSuper) ('Staff', Icons.badge_outlined, const StaffTab()),
    ('Organizations', Icons.business_outlined, OrgsTab(isSuper: isSuper)),
    ('Prices', Icons.sell_outlined, PricingTab(isSuper: isSuper)),
    ('Packages', Icons.inventory_2_outlined, PackagesTab(isSuper: isSuper)),
    ('Providers', Icons.hub_outlined, ProvidersTab(isSuper: isSuper)),
    ('System Map', Icons.monitor_heart_outlined, const SystemMapTab()),
    ('Tickets', Icons.support_agent_outlined, const TicketsTab()),
    ('Webhooks', Icons.webhook_outlined, const WebhooksTab()),
    ('Audit log', Icons.fact_check_outlined, const AuditTab()),
    ('Reconciliation', Icons.balance_outlined, const ReconciliationTab()),
    ('Company', Icons.apartment_outlined, CompanyTab(isSuper: isSuper)),
    ('Account', Icons.person_outline, Account(me: widget.me, signOut: widget.signOut)),
  ];

  @override
  Widget build(BuildContext context) {
    final items = sections;
    final i = tab < items.length ? tab : 0;
    return Scaffold(
      appBar: AppBar(title: Text(items[i].$1)),
      drawer: Drawer(child: SafeArea(child: ListView(children: [
        const ListTile(title: Text('OTPProvider Admin', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
        for (var k = 0; k < items.length; k++)
          ListTile(
            leading: Icon(items[k].$2), title: Text(items[k].$1), selected: k == i,
            onTap: () { Navigator.pop(context); setState(() => tab = k); },
          ),
      ]))),
      body: KeyedSubtree(key: ValueKey(items[i].$1), child: items[i].$3),
    );
  }
}

Future<String?> askNote(BuildContext context, String title, String label, {bool confirmFunds = false}) {
  final c = TextEditingController();
  bool confirmed = !confirmFunds;
  return showDialog<String>(
    context: context,
    builder: (ctx) => StatefulBuilder(builder: (ctx, set) {
      final ok = c.text.trim().length >= 5 && confirmed;
      return AlertDialog(
        title: Text(title),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: c, maxLength: 500, maxLines: 3, onChanged: (_) => set(() {}), decoration: InputDecoration(labelText: '$label (5-500 characters)')),
          if (confirmFunds) CheckboxListTile(contentPadding: EdgeInsets.zero, value: confirmed, onChanged: (v) => set(() => confirmed = v ?? false), title: const Text('I confirmed in the receiving account that these funds arrived.')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: ok ? () => Navigator.pop(ctx, c.text.trim()) : null, child: const Text('Confirm')),
        ],
      );
    }),
  );
}

class DepositsTab extends StatefulWidget {
  final bool isSuper;
  const DepositsTab({super.key, required this.isSuper});
  @override
  State<DepositsTab> createState() => _DepositsState();
}

class _DepositsState extends State<DepositsTab> {
  List<dynamic>? rows;
  String err = '';
  String ok = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final r = await Api.get('/v1/admin/deposits');
    if (!mounted) return;
    setState(() { if (r.ok) { rows = r.list; } else { rows = []; err = errorText(r); } });
  }

  Future<void> _act(String id, String kind) async {
    final note = await askNote(context, kind == 'approve' ? 'Approve deposit' : 'Reject deposit', kind == 'approve' ? 'Receipt verification note' : 'Reason', confirmFunds: kind == 'approve');
    if (note == null) return;
    final r = await Api.post('/v1/admin/deposits/$id/$kind', kind == 'approve' ? {'receiptNote': note} : {'reason': note});
    if (!mounted) return;
    setState(() { if (r.ok) { ok = kind == 'approve' ? 'Approved and credited.' : 'Rejected.'; err = ''; } else { err = errorText(r); ok = ''; } });
    if (r.ok) await _load();
  }

  Future<void> _requestApproval(String id) async {
    final r = await Api.post('/v1/admin/deposits/$id/request-approval');
    if (!mounted) return;
    setState(() { if (r.ok) { ok = 'Approval requested from a Super Admin.'; err = ''; } else { err = errorText(r); ok = ''; } });
    if (r.ok) await _load();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Approve only after you independently verified in the receiving account that the money arrived.'),
        const SizedBox(height: 12),
        if (err.isNotEmpty) Banner2(err),
        if (ok.isNotEmpty) Banner2(ok, ok: true),
        if (rows == null) const LinearProgressIndicator(),
        if (rows != null && rows!.isEmpty) const Text('No open deposits.'),
        for (final d in rows ?? <dynamic>[])
          Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${(d as Map<String, dynamic>)['organization']['name']}', style: Theme.of(context).textTheme.titleMedium),
            Text('${usd(d['amountUsd'])} - ${d['status']}'.replaceAll('_', ' ')),
            if (d['approvalStatus'] != null) Text('Approval: ${d['approvalStatus']}'),
            if (d['note'] != null) Text('Customer note: ${d['note']}'),
            if (d['supportEvidenceNote'] != null) Text('Support evidence review: ${d['supportEvidenceNote']}'),
            if (d['ticketId'] != null) Text('Linked support ticket: ${d['ticketId']}'),
            const SizedBox(height: 8),
            Wrap(spacing: 8, children: [
              if (!widget.isSuper && d['approvalStatus'] != 'approved' && d['approvalStatus'] != 'pending') OutlinedButton(onPressed: () => _requestApproval('${d['id']}'), child: const Text('Request approval')),
              FilledButton(onPressed: () => _act('${d['id']}', 'approve'), child: const Text('Approve')),
              OutlinedButton(onPressed: () => _act('${d['id']}', 'reject'), child: const Text('Reject')),
            ]),
          ]))),
      ]),
    );
  }
}

class ApprovalsTab extends StatefulWidget {
  const ApprovalsTab({super.key});
  @override
  State<ApprovalsTab> createState() => _ApprovalsState();
}

class _ApprovalsState extends State<ApprovalsTab> {
  List<dynamic>? rows;
  String err = '';
  String ok = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final r = await Api.get('/v1/admin/approvals');
    if (!mounted) return;
    setState(() { if (r.ok) { rows = r.list; } else { rows = []; err = errorText(r); } });
  }

  Future<void> _decide(String id, String decision) async {
    final note = await askNote(context, decision == 'approved' ? 'Grant approval' : 'Reject approval', 'Decision note');
    if (note == null) return;
    final r = await Api.post('/v1/admin/approvals/$id/decide', {'decision': decision, 'note': note});
    if (!mounted) return;
    setState(() { if (r.ok) { ok = 'Done.'; err = ''; } else { err = r.status == 409 ? 'That approval is not pending, or you requested it yourself.' : errorText(r); ok = ''; } });
    if (r.ok) await _load();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('You cannot decide a request you raised yourself.'),
        const SizedBox(height: 12),
        if (err.isNotEmpty) Banner2(err),
        if (ok.isNotEmpty) Banner2(ok, ok: true),
        if (rows == null) const LinearProgressIndicator(),
        if (rows != null && rows!.isEmpty) const Text('No pending approvals.'),
        for (final a in rows ?? <dynamic>[])
          Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${(a as Map<String, dynamic>)['organization'] ?? ''}  ${a['amountUsd'] == null ? '' : usd(a['amountUsd'])}', style: Theme.of(context).textTheme.titleMedium),
            Text('Requested by ${a['requestedBy']}'),
            const SizedBox(height: 8),
            Wrap(spacing: 8, children: [
              FilledButton(onPressed: () => _decide('${a['id']}', 'approved'), child: const Text('Approve')),
              OutlinedButton(onPressed: () => _decide('${a['id']}', 'rejected'), child: const Text('Reject')),
            ]),
          ]))),
      ]),
    );
  }
}

class Account extends StatelessWidget {
  final Map<String, dynamic> me;
  final Future<void> Function() signOut;
  const Account({super.key, required this.me, required this.signOut});
  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      ListTile(title: const Text('Email'), subtitle: Text('${me['email']}')),
      ListTile(title: const Text('Role'), subtitle: Text('${me['role']}'.replaceAll('_', ' '))),
      const SizedBox(height: 16),
      FilledButton(onPressed: signOut, child: const Text('Sign out')),
    ]);
  }
}


class ProvidersTab extends StatefulWidget {
  final bool isSuper;
  const ProvidersTab({super.key, required this.isSuper});
  @override
  State<ProvidersTab> createState() => _ProvidersState();
}

class _ProvidersState extends State<ProvidersTab> {
  List<dynamic>? rows;
  String err = '';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final r = await Api.get('/v1/admin/providers');
    if (!mounted) return;
    setState(() { if (r.ok) { rows = r.list; err = ''; } else { rows = []; err = errorText(r); } });
  }

  Future<void> _set(String id, Map<String, dynamic> body) async {
    final r = await Api.post('/v1/admin/providers/$id/set', body);
    if (!mounted) return;
    if (!r.ok) setState(() => err = errorText(r));
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Providers stay off until a Super Admin enables them.'),
        const SizedBox(height: 12),
        if (err.isNotEmpty) Banner2(err),
        if (rows == null) const LinearProgressIndicator(),
        if (rows != null && rows!.isEmpty) const Text('No providers configured.'),
        for (final p in rows ?? <dynamic>[])
          Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${p['key']}', style: const TextStyle(fontWeight: FontWeight.w700)),
            Text('${p['channel']}  -  priority ${p['priority']}  -  ${p['maintenance'] == true ? 'maintenance' : (p['enabled'] == true ? 'enabled' : 'disabled')}'),
            if (widget.isSuper) Row(children: [
              TextButton(onPressed: () => _set('${p['id']}', {'enabled': p['enabled'] != true}), child: Text(p['enabled'] == true ? 'Disable' : 'Enable')),
              TextButton(onPressed: () => _set('${p['id']}', {'maintenance': p['maintenance'] != true}), child: Text(p['maintenance'] == true ? 'End maintenance' : 'Maintenance')),
            ]),
          ]))),
      ]),
    );
  }
}

class SystemMapTab extends StatefulWidget {
  const SystemMapTab({super.key});
  @override
  State<SystemMapTab> createState()=>_SystemMapTabState();
}
class _SystemMapTabState extends State<SystemMapTab>{
  Map<String,dynamic>? data;String err='';bool busy=false;
  @override
  void initState(){super.initState();_load();}
  Future<void> _load() async{
    setState(()=>busy=true);final r=await Api.get('/v1/dashboard/system');if(!mounted)return;
    setState(() { busy=false;if(r.ok){data=r.map;err='';}else{err=errorText(r);} });
  }
  Color _color(String s)=>s=='healthy'?Colors.green:s=='critical'?Colors.red:Colors.orange;
  @override
  Widget build(BuildContext context)=>RefreshIndicator(onRefresh:_load,child:ListView(padding:const EdgeInsets.all(16),children:[
    Text('System status: ${data?['overall']??'Loading'}',style:Theme.of(context).textTheme.titleLarge),
    if(err.isNotEmpty)Banner2(err),if(data==null)const LinearProgressIndicator(),
    if(data!=null) ...[
      Wrap(spacing:8,runSpacing:8,children:['healthy','warning','critical','unknown'].map((s)=>Chip(label:Text('${s.toUpperCase()}: ${(data!['counts'] as Map<String,dynamic>)[s]??0}'),backgroundColor:_color(s).withValues(alpha:.12))).toList()),
      for(final raw in data!['items'] as List<dynamic>) Builder(builder:(context){final x=raw as Map<String,dynamic>;final state='${x['state']}';return Card(child:ListTile(leading:Icon(Icons.circle,color:_color(state),size:14),title:Text('${x['label']}'),subtitle:Text('${x['detail']}\nAction: ${x['action']}')));}),
    ],
    OutlinedButton(onPressed:busy?null:_load,child:Text(busy?'Checking…':'Run checks'))
  ]));
}

