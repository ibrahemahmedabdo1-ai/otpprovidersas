import 'dart:async';
import 'package:flutter/material.dart';
import 'core.dart';
import 'keys.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterState();
}

class _RegisterState extends State<RegisterScreen> {
  final name = TextEditingController();
  final email = TextEditingController();
  final pass = TextEditingController();
  bool busy = false;
  bool done = false;
  bool resendBusy = false;
  String resendMessage = '';
  String err = '';

  Future<void> submit() async {
    setState(() { busy = true; err = ''; });
    final r = await Api.post('/v1/auth/register', {'email': email.text.trim(), 'password': pass.text, 'name': name.text.trim()});
    if (!mounted) return;
    setState(() { busy = false; if (r.ok) { done = true; } else { err = errorText(r); } });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create your account')),
      body: ListView(padding: const EdgeInsets.all(24), children: [
        if (done) ...[
          const Banner2('If this address can be registered, we sent a verification link valid for 24 hours. Verify your email, then sign in.', ok: true),
          if (resendMessage.isNotEmpty) Banner2(resendMessage, ok: true),
          FilledButton(onPressed: resendBusy ? null : () async {
            setState(() { resendBusy = true; resendMessage = ''; });
            final r = await Api.post('/v1/auth/resend-verification', {'email': email.text.trim()});
            if (!mounted) return;
            setState(() { resendBusy = false; resendMessage = r.ok ? 'If the account needs verification, a new email will be sent shortly.' : errorText(r); });
          }, child: Text(resendBusy ? 'Sending…' : 'Resend verification email')),
        ] else ...[
          const Text('No payment details are requested here. Password: at least 12 characters.'),
          const SizedBox(height: 12),
          if (err.isNotEmpty) Banner2(err),
          TextField(controller: name, decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder())),
          const SizedBox(height: 12),
          TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder())),
          const SizedBox(height: 12),
          TextField(controller: pass, obscureText: true, decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder())),
          const SizedBox(height: 16),
          FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Creating account' : 'Create account')),
        ],
      ]),
    );
  }
}

class Home extends StatefulWidget {
  final Map<String, dynamic> me;
  final Future<void> Function() signOut;
  const Home({super.key, required this.me, required this.signOut});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  int tab = 0;
  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[const WalletTab(), const ProjectsTab(), const SupportTab(), AccountTab(me: widget.me, signOut: widget.signOut)];
    return Scaffold(
      appBar: AppBar(title: const Text('OTPProvider')),
      body: Column(children: [
        Container(width: double.infinity, color: Theme.of(context).colorScheme.secondaryContainer, padding: const EdgeInsets.all(8), child: const Text('Live Email OTP requires an approved organization, funded wallet and enabled project. WhatsApp OTP is not yet available until delivery receipts and billing reconciliation are verified. Sandbox requests do not send messages or charge your wallet.', style: TextStyle(fontSize: 12))),
        Expanded(child: pages[tab]),
      ]),
      bottomNavigationBar: NavigationBar(selectedIndex: tab, onDestinationSelected: (i) => setState(() => tab = i), destinations: const [
        NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), label: 'Wallet'),
        NavigationDestination(icon: Icon(Icons.folder_outlined), label: 'Projects'),
        NavigationDestination(icon: Icon(Icons.support_agent), label: 'Support'),
        NavigationDestination(icon: Icon(Icons.person_outline), label: 'Account'),
      ]),
    );
  }
}

class WalletTab extends StatefulWidget {
  const WalletTab({super.key});
  @override
  State<WalletTab> createState() => _WalletState();
}

class _WalletState extends State<WalletTab> {
  Map<String, dynamic>? w;
  List<dynamic> deps = [];
  String err = '';
  String ok = '';
  final amount = TextEditingController();
  bool busy = false;
  String? supportTicketId;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final a = await Api.get('/v1/console/wallet');
    final b = await Api.get('/v1/console/wallet/deposits');
    if (!mounted) return;
    setState(() { if (a.ok) { w = a.map; } else { err = errorText(a); } if (b.ok) deps = b.list; });
  }

  Future<void> _request() async {
    final v = amount.text.trim();
    if (!RegExp(r'^\d{1,7}(\.\d{1,2})?$').hasMatch(v) || double.tryParse(v) == 0) { setState(() { err = 'Enter a positive amount in USD with at most 2 decimals.'; ok = ''; }); return; }
    setState(() { busy = true; err = ''; ok = ''; });
    final r = await Api.post('/v1/console/wallet/deposits', {'amountUsd': v});
    if (!mounted) return;
    setState(() { busy = false; if (r.ok) { ok = 'Top-up request recorded. Your balance has not changed. Continue in the linked Support conversation; credit is added only after Admin approval.'; supportTicketId = r.map['ticketId'] as String?; amount.clear(); } else { err = errorText(r); } });
    if (r.ok) await _load();
  }

  String _bal(String k) => usd((w?[k] as Map<String, dynamic>?)?['usd'] ?? '0');

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        if (err.isNotEmpty) Banner2(err),
        if (ok.isNotEmpty) ...[Banner2(ok, ok: true), if(supportTicketId!=null) FilledButton(onPressed:()=>Navigator.of(context).push(MaterialPageRoute<void>(builder:(_)=>SupportThreadPage(ticketId:supportTicketId!))),child:const Text('Open Support conversation'))],
        if (w == null && err.isEmpty) const LinearProgressIndicator(),
        if (w != null) ...[
          Text('Available', style: Theme.of(context).textTheme.labelLarge),
          Text(_bal('available'), style: Theme.of(context).textTheme.displaySmall),
          const SizedBox(height: 8),
          Wrap(spacing: 16, runSpacing: 4, children: [
            Text('Paid ${_bal('paid')}'), Text('Promotional ${_bal('promotional')}'), Text('Reserved ${_bal('reserved')}'), Text('Pending ${_bal('pending')}'),
          ]),
        ],
        const Divider(height: 32),
        Text('Request a top-up', style: Theme.of(context).textTheme.titleMedium),
        const Text('A request does not charge you or add funds. Only an administrator can credit your wallet after verifying the payment.'),
        const SizedBox(height: 8),
        TextField(controller: amount, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Amount (USD)', border: OutlineInputBorder())),
        const SizedBox(height: 8),
        FilledButton(onPressed: busy ? null : _request, child: Text(busy ? 'Sending' : 'Request top-up')),
        const Divider(height: 32),
        Text('Top-up requests', style: Theme.of(context).textTheme.titleMedium),
        if (deps.isEmpty) const Text('No top-up requests yet.'),
        for (final d in deps) ListTile(dense: true, title: Text(usd((d as Map<String, dynamic>)['amountUsd'])), subtitle: Text('${d['status']}'.replaceAll('_', ' ')), trailing: d['ticketId'] is String ? IconButton(icon:const Icon(Icons.chat_outlined),onPressed:()=>Navigator.of(context).push(MaterialPageRoute<void>(builder:(_)=>SupportThreadPage(ticketId:'${d['ticketId']}')))) : null),
        const Divider(height: 32),
        const TransactionsList(),
      ]),
    );
  }
}

class ProjectsTab extends StatefulWidget {
  const ProjectsTab({super.key});
  @override
  State<ProjectsTab> createState() => _ProjectsState();
}

class _ProjectsState extends State<ProjectsTab> {
  List<dynamic>? items;
  String err = '';
  final name = TextEditingController();
  bool busy = false;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final r = await Api.get('/v1/console/projects');
    if (!mounted) return;
    setState(() { if (r.ok) { items = r.list; } else { items = []; err = errorText(r); } });
  }

  Future<void> _create() async {
    setState(() { busy = true; err = ''; });
    final r = await Api.post('/v1/console/projects', {'name': name.text.trim()});
    if (!mounted) return;
    setState(() { busy = false; if (r.ok) { name.clear(); } else { err = errorText(r); } });
    if (r.ok) await _load();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        if (err.isNotEmpty) Banner2(err),
        TextField(controller: name, decoration: const InputDecoration(labelText: 'New project name', border: OutlineInputBorder())),
        const SizedBox(height: 8),
        FilledButton(onPressed: busy ? null : _create, child: Text(busy ? 'Creating' : 'Create project')),
        const Divider(height: 32),
        if (items == null) const LinearProgressIndicator(),
        if (items != null && items!.isEmpty) const Text('No projects yet. Create one, then open it to create an API key.'),
        for (final p in items ?? <dynamic>[]) ListTile(title: Text('${(p as Map<String, dynamic>)['name']}'), subtitle: Text('${p['activeKeys']} active keys'), trailing: const Icon(Icons.chevron_right), onTap: () async { await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProjectPage(project: p))); await _load(); }),
      ]),
    );
  }
}

class AccountTab extends StatefulWidget {
  final Map<String, dynamic> me;
  final Future<void> Function() signOut;
  const AccountTab({super.key, required this.me, required this.signOut});
  @override
  State<AccountTab> createState() => _AccountTabState();
}

class _AccountTabState extends State<AccountTab> {
  Map<String,dynamic>? status;
  Map<String,dynamic>? verification;
  final useCase=TextEditingController();
  final website=TextEditingController();
  String err='';
  String ok='';
  bool busy=false;
  @override
  void initState(){super.initState();_load();}
  @override
  void dispose(){useCase.dispose();website.dispose();super.dispose();}
  Future<void> _load() async {
    final a=await Api.get('/v1/console/status');
    final b=await Api.get('/v1/console/verification');
    if(!mounted)return;
    setState((){if(a.ok)status=a.map;if(b.ok){verification=b.map;useCase.text='${b.map['useCase']??''}';website.text='${b.map['website']??''}';}});
  }
  Future<void> _submit() async {
    if(useCase.text.trim().length<20){setState(()=>err='Describe your business and intended OTP use in at least 20 characters.');return;}
    setState(() { busy=true; err=''; ok=''; });
    final r=await Api.post('/v1/console/verification',{'useCase':useCase.text.trim(),'website':website.text.trim().isEmpty?null:website.text.trim()});
    if(!mounted)return;
    setState(()=>busy=false);
    if(r.ok){setState(()=>ok='Submitted for administrator review.');await _load();}else setState(()=>err=errorText(r));
  }
  @override
  Widget build(BuildContext context) {
    final approved=verification?['status']=='approved';
    return ListView(padding:const EdgeInsets.all(16),children:[
      ListTile(title:const Text('Email'),subtitle:Text('${widget.me['email']}')),
      ListTile(title:const Text('Name'),subtitle:Text('${widget.me['name']}')),
      const Divider(height:32),
      Text('Account activation',style:Theme.of(context).textTheme.titleMedium),
      if(status!=null) Banner2('${status!['message']??''}',ok:status!['emailAccountApproved']==true),
      if(verification==null) const LinearProgressIndicator(),
      if(verification!=null) ...[
        ListTile(title:const Text('Organization verification'),subtitle:Text('${verification!['status']??'not_submitted'}'.replaceAll('_',' '))),
        if(verification!['note']!=null) Banner2('${verification!['note']}'),
        if(!approved) ...[
          TextField(controller:useCase,minLines:3,maxLines:5,maxLength:1000,decoration:const InputDecoration(labelText:'Business and intended OTP use (20–1000 characters)',border:OutlineInputBorder())),
          const SizedBox(height:8),
          TextField(controller:website,keyboardType:TextInputType.url,decoration:const InputDecoration(labelText:'Business website (optional HTTPS)',border:OutlineInputBorder())),
          const SizedBox(height:8),
          FilledButton(onPressed:busy?null:_submit,child:Text(busy?'Submitting…':'Submit for admin review')),
        ],
      ],
      if(err.isNotEmpty) Banner2(err),
      if(ok.isNotEmpty) Banner2(ok,ok:true),
      const SizedBox(height:16),
      FilledButton(onPressed:widget.signOut,child:const Text('Sign out')),
    ]);
  }
}

class SupportTab extends StatefulWidget {
  const SupportTab({super.key});
  @override
  State<SupportTab> createState() => _SupportTabState();
}

class _SupportTabState extends State<SupportTab> {
  List<dynamic>? tickets;
  String err = '';
  bool busy = false;
  final subject = TextEditingController();
  final message = TextEditingController();
  Timer? refresh;

  @override
  void initState() {
    super.initState();
    _load();
    refresh = Timer.periodic(const Duration(seconds: 15), (_) => _load());
  }

  @override
  void dispose() {
    refresh?.cancel();
    subject.dispose();
    message.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final r = await Api.get('/v1/console/tickets');
    if (!mounted) return;
    setState(() {
      if (r.ok) { tickets = r.list; err = ''; }
      else { tickets ??= []; err = errorText(r); }
    });
  }

  Future<void> _create() async {
    if (subject.text.trim().length < 3 || message.text.trim().isEmpty) return;
    setState(() { busy = true; err = ''; });
    final r = await Api.post('/v1/console/tickets', {
      'subject': subject.text.trim(),
      'body': message.text.trim(),
    });
    if (!mounted) return;
    setState(() { busy = false; if (!r.ok) err = errorText(r); });
    if (r.ok) {
      final id = '${r.map['id'] ?? ''}';
      subject.clear();
      message.clear();
      await _load();
      if (id.isNotEmpty && mounted) {
        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => SupportThreadPage(ticketId: id)));
        if (mounted) await _load();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Contact our support team. Your conversations are private to your account, and replies appear here automatically.'),
        const SizedBox(height: 12),
        if (err.isNotEmpty) Banner2(err),
        Text('Start a conversation', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        TextField(controller: subject, onChanged: (_) => setState(() {}), maxLength: 150, decoration: const InputDecoration(labelText: 'Subject', border: OutlineInputBorder())),
        const SizedBox(height: 8),
        TextField(controller: message, onChanged: (_) => setState(() {}), maxLength: 5000, minLines: 3, maxLines: 6, decoration: const InputDecoration(labelText: 'How can we help?', border: OutlineInputBorder())),
        const SizedBox(height: 8),
        FilledButton(onPressed: busy || subject.text.trim().length < 3 || message.text.trim().isEmpty ? null : _create, child: Text(busy ? 'Sending…' : 'Send to support')),
        const Divider(height: 32),
        Text('Your conversations', style: Theme.of(context).textTheme.titleMedium),
        if (tickets == null) const LinearProgressIndicator(),
        if (tickets != null && tickets!.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: Text('No conversations yet. Start one above.')),
        for (final raw in tickets ?? <dynamic>[])
          Builder(builder: (context) {
            final t = raw as Map<String, dynamic>;
            return Card(
              child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.support_agent)),
                title: Text('${t['subject'] ?? 'Support request'}'),
                subtitle: Text('Status: ${t['status'] ?? 'open'}'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  await Navigator.of(context).push(MaterialPageRoute(builder: (_) => SupportThreadPage(ticketId: '${t['id']}')));
                  if (mounted) await _load();
                },
              ),
            );
          }),
      ]),
    );
  }
}

class SupportThreadPage extends StatefulWidget {
  final String ticketId;
  const SupportThreadPage({super.key, required this.ticketId});
  @override
  State<SupportThreadPage> createState() => _SupportThreadPageState();
}

class _SupportThreadPageState extends State<SupportThreadPage> {
  Map<String, dynamic>? thread;
  String err = '';
  bool busy = false;
  final reply = TextEditingController();
  Timer? refresh;

  @override
  void initState() {
    super.initState();
    _load();
    refresh = Timer.periodic(const Duration(seconds: 5), (_) => _load());
  }

  @override
  void dispose() {
    refresh?.cancel();
    reply.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final r = await Api.get('/v1/console/tickets/${widget.ticketId}');
    if (!mounted) return;
    setState(() { if (r.ok) { thread = r.map; err = ''; } else { err = errorText(r); } });
  }

  Future<void> _send() async {
    final body = reply.text.trim();
    if (body.isEmpty) return;
    setState(() { busy = true; err = ''; });
    final r = await Api.post('/v1/console/tickets/${widget.ticketId}/reply', {'body': body});
    if (!mounted) return;
    setState(() { busy = false; if (!r.ok) err = errorText(r); else reply.clear(); });
    if (r.ok) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final ticket = thread?['ticket'] as Map<String, dynamic>?;
    final messages = thread?['messages'] as List<dynamic>? ?? <dynamic>[];
    return Scaffold(
      appBar: AppBar(title: Text(ticket?['subject']?.toString() ?? 'Support conversation')),
      body: Column(children: [
        if (err.isNotEmpty) Padding(padding: const EdgeInsets.fromLTRB(12, 12, 12, 0), child: Banner2(err)),
        Expanded(
          child: thread == null
              ? const Center(child: CircularProgressIndicator())
              : messages.isEmpty
                  ? const Center(child: Text('No messages yet.'))
                  : ListView.builder(
                      padding: const EdgeInsets.all(12),
                      itemCount: messages.length,
                      itemBuilder: (context, index) {
                        final m = messages[index] as Map<String, dynamic>;
                        final mine = m['from'] == 'you';
                        return Align(
                          alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * .82),
                            margin: const EdgeInsets.symmetric(vertical: 5),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: mine ? Theme.of(context).colorScheme.primaryContainer : Theme.of(context).colorScheme.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(mine ? 'You' : 'OTPProvider Support', style: Theme.of(context).textTheme.labelSmall),
                              const SizedBox(height: 4),
                              Text('${m['body'] ?? ''}'),
                              const SizedBox(height: 4),
                              Text('${m['createdAt'] ?? ''}', style: Theme.of(context).textTheme.labelSmall),
                            ]),
                          ),
                        );
                      },
                    ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(child: TextField(controller: reply, onChanged: (_) => setState(() {}), minLines: 1, maxLines: 4, maxLength: 5000, decoration: const InputDecoration(hintText: 'Write a reply…', border: OutlineInputBorder(), counterText: ''))),
              const SizedBox(width: 8),
              IconButton.filled(onPressed: busy || reply.text.trim().isEmpty ? null : _send, icon: busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send)),
            ]),
          ),
        ),
      ]),
    );
  }
}
