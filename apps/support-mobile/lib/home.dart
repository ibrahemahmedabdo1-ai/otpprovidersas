import 'package:flutter/material.dart';
import 'core.dart';

const unavailable = 'Ticketing is not available on this server yet, so no tickets can be shown.';

class Home extends StatelessWidget {
  final Map<String, dynamic> me;
  final Future<void> Function() signOut;
  const Home({super.key, required this.me, required this.signOut});
  @override
  Widget build(BuildContext context) {
    return DefaultTabController(length:2,child:Scaffold(
      appBar: AppBar(title: const Text('Support'), actions: [TextButton(onPressed: signOut, child: const Text('Sign out'))],bottom:const TabBar(tabs:[Tab(text:'Tickets'),Tab(text:'Top-ups')])),
      body:const TabBarView(children:[TicketList(),TopupQueue()]),
    ));
  }
}

class TopupQueue extends StatefulWidget {
  const TopupQueue({super.key});
  @override
  State<TopupQueue> createState()=>_TopupQueueState();
}
class _TopupQueueState extends State<TopupQueue>{
  List<dynamic>? rows;String err='';String ok='';bool loading=false;
  final Map<String,TextEditingController> notes={};
  @override
  void initState(){super.initState();_load();}
  @override
  void dispose(){for(final c in notes.values){c.dispose();}super.dispose();}
  Future<void> _load() async{
    setState(() { loading=true; });
    final r=await Api.get('/v1/support/deposits');if(!mounted)return;
    setState(() { loading=false;if(r.ok){rows=r.list;err='';}else{rows=[];err=errorText(r);} });
  }
  Future<void> _submit(String id) async{
    final note=notes[id]?.text.trim()??'';
    if(note.length<5){setState(()=>err='Add the transfer reference and how it was checked (at least 5 characters).');return;}
    setState(() { loading=true;err='';ok=''; });
    final r=await Api.post('/v1/support/deposits/$id/submit',{'evidenceNote':note});
    if(!mounted)return;
    setState(() { loading=false; });
    if(r.ok){setState(()=>ok='Submitted to Admin. No wallet balance was changed.');notes[id]?.clear();await _load();}else setState(()=>err=errorText(r));
  }
  @override
  Widget build(BuildContext context)=>RefreshIndicator(onRefresh:_load,child:ListView(padding:const EdgeInsets.all(16),children:[
    const Text('Review transfer evidence, record the reference and submit to Admin. Support cannot approve or credit wallet funds.'),
    if(err.isNotEmpty)Banner2(err),if(ok.isNotEmpty)Banner2(ok,ok:true),if(rows==null)const LinearProgressIndicator(),
    if(rows!=null&&rows!.isEmpty)const Text('No open top-up requests.'),
    for(final raw in rows??<dynamic>[]) Builder(builder:(context){
      final d=raw as Map<String,dynamic>;final id='${d['id']}';final controller=notes.putIfAbsent(id,()=>TextEditingController());
      return Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text('${d['customerEmail']}',style:Theme.of(context).textTheme.titleMedium),Text('${d['organization']} · ${d['amountUsd']} · ${d['status']}'),
        if(d['note']!=null)Text('Customer note: ${d['note']}'),
        if(d['ticketId'] is String)TextButton.icon(onPressed:()=>Navigator.of(context).push(MaterialPageRoute<void>(builder:(_)=>TicketScreen(id:'${d['ticketId']}'))),icon:const Icon(Icons.chat),label:const Text('Open customer conversation')),
        TextField(controller:controller,minLines:2,maxLines:4,maxLength:500,decoration:const InputDecoration(labelText:'Transfer reference and evidence review',border:OutlineInputBorder())),
        const SizedBox(height:8),FilledButton(onPressed:loading?null:()=>_submit(id),child:const Text('Submit to Admin for approval'))
      ])));
    })
  ]));
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
