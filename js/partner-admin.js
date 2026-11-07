(() => {
  'use strict';
  const statuses = {pending:'Pending', approved:'Approved', rejected:'Rejected'};
  const documents = {
    rider:[['driver-license','Driver’s license'],['motor-registration','Motorcycle OR/CR']],
    store:[['business-document','Business document']]
  };
  const types = {'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'};

  async function open({db,target,esc,toast,confirm,active}) {
    const ready = () => target.isConnected && active();
    let status='pending', kind='all', page=0, serial=0;
    const count=20;
    target.innerHTML=`<section class="panel"><h3>Rider and store partner applications</h3>
      <p class="mu sm">Review the required documents before deciding. Application files are private.</p>
      <div class="row wrap" style="gap:10px;margin-top:10px">
      <label>Status <select class="in" data-application-status><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
      <label>Type <select class="in" data-application-kind><option value="all">All partners</option><option value="rider">Riders</option><option value="store">Stores</option></select></label>
      <button class="btn s sm" type="button" data-application-refresh>Refresh</button></div></section>
      <p class="sm" role="status" data-application-message></p><div data-application-list></div>
      <div class="row" data-application-pages hidden><button class="btn s sm" type="button" data-application-prev>Previous</button>
      <button class="btn s sm" type="button" data-application-next>Next</button></div>`;
    const find=selector=>target.querySelector(selector);
    const list=find('[data-application-list]'), message=find('[data-application-message]');
    const pages=find('[data-application-pages]'), previous=find('[data-application-prev]'), next=find('[data-application-next]');
    const date=new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'});

    async function reload() {
      const request=++serial;
      message.textContent='Loading applications…';list.replaceChildren();pages.hidden=true;
      try {
        let query=db.from('papalita_partner_applications')
          .select('id,kind,status,full_name,email,phone,locality,store_name,store_address,document_type,submitted_at,review_note')
          .eq('status',status).order('submitted_at',{ascending:false}).order('id',{ascending:false}).range(page*count,(page+1)*count);
        if(kind!=='all')query=query.eq('kind',kind);
        const {data,error}=await query;
        if(!ready()||request!==serial)return;
        if(error)throw error;
        message.textContent=data.length?'':'No applications in this view.';
        list.innerHTML=data.slice(0,count).map(row=>`<article class="panel" style="margin:12px 0">
          <div class="row sp wrap"><h3>${esc(row.kind==='store'?row.store_name:row.full_name)}</h3><strong>${esc(statuses[row.status])}</strong></div>
          <p class="mu sm">${row.kind==='rider'?'Rider':'Store Partner'} · ${esc(date.format(new Date(row.submitted_at)))}</p>
          <p class="sm">${esc(row.full_name)} · ${esc(row.email)} · ${esc(row.phone)}</p>
          <p class="sm">${esc(row.locality)}${row.kind==='store'?' · '+esc(row.store_address)+' · '+esc(row.document_type):''}</p>
          ${row.review_note?`<p class="sm">Reason: ${esc(row.review_note)}</p>`:''}
          <div class="row wrap" style="gap:8px;margin-top:10px">
            ${documents[row.kind].map(([slot,label])=>`<button class="btn s sm" type="button" data-download="${esc(row.id)}" data-doc-slot="${slot}">Download ${label}</button>`).join('')}
            ${row.status==='pending'?`<button class="btn p sm" type="button" data-review="${esc(row.id)}" data-decision="approve">Approve</button>
              <button class="btn s sm" type="button" data-review="${esc(row.id)}" data-decision="reject">Reject</button>`:''}
          </div></article>`).join('');
        pages.hidden=page===0&&data.length<=count;
        previous.disabled=page===0; next.disabled=data.length<=count;
      }catch(error){
        if(ready()&&request===serial)message.textContent=error.message || 'Could not load applications.';
      }
    }

    async function download(button) {
      button.disabled=true;
      try {
        const {data,error}=await db.storage.from('papalita-application-docs').download(button.dataset.download+'/'+button.dataset.docSlot);
        if(error)throw error;
        const url=URL.createObjectURL(data),link=document.createElement('a');
        link.href=url;link.download=button.dataset.docSlot+'-'+button.dataset.download.slice(0,8)+'.'+(types[data.type]||'bin');
        link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch(error){toast(error.message || 'Could not download the document.');}
      finally{button.disabled=false;}
    }

    function rejectionReason() {
      return new Promise(resolve=>{
        const dialog=document.createElement('dialog');
        dialog.className='pa-dialog';
        dialog.setAttribute('aria-labelledby','pa-rejection-title');
        dialog.innerHTML=`<div class="pa-dialog-head"><h2 id="pa-rejection-title">Reject application</h2></div>
          <form class="pa-dialog-body"><p class="mu sm">The applicant will see this reason on their application page.</p>
            <label for="pa-rejection-reason">Reason for rejection</label>
            <textarea class="in" id="pa-rejection-reason" name="reason" rows="4" minlength="3" maxlength="400" required></textarea>
            <p class="err" role="alert"></p><div class="row wrap" style="justify-content:flex-end;gap:8px">
              <button class="btn s" type="button">Cancel</button><button class="btn d" type="submit">Reject application</button>
            </div></form>`;
        const form=dialog.querySelector('form');
        dialog.querySelector('[type=button]').onclick=()=>dialog.close();
        let reason=null;
        form.onsubmit=event=>{
          event.preventDefault();
          const text=form.elements.reason.value.trim();
          if(text.length<3){form.querySelector('.err').textContent='Enter at least 3 characters.';return;}
          reason=text;dialog.close();
        };
        dialog.addEventListener('close',()=>{dialog.remove();resolve(reason);},{once:true});
        document.body.append(dialog);dialog.showModal();form.elements.reason.focus();
      });
    }

    async function decide(button) {
      const approve=button.dataset.decision==='approve';
      button.disabled=true;
      try {
        const reason=approve?null:await rejectionReason();
        if(!approve&&reason===null)return;
        if(approve&&!await confirm('Approve application?',
          'This grants access to the Rider Portal or activates the applicant’s store in the Merchant Portal.',
          'Approve application'))return;
        if(!ready())return;
        const {error}=await db.rpc('papalita_review_partner_application',{p_id:button.dataset.review,p_approve:approve,p_note:reason});
        if(error)throw error;
        toast(approve?'Application approved.':'Application rejected.');
        page=0;
        await reload();
      }catch(error){toast(error.message || 'Could not save the decision.');}
      finally{button.disabled=false;}
    }

    list.addEventListener('click',event=>{
      const doc=event.target.closest('[data-download]');
      const decision=event.target.closest('[data-review]');
      if(doc)void download(doc);
      if(decision)void decide(decision);
    });
    find('[data-application-status]').onchange=event=>{status=event.target.value;page=0;void reload();};
    find('[data-application-kind]').onchange=event=>{kind=event.target.value;page=0;void reload();};
    find('[data-application-refresh]').onclick=()=>void reload();
    previous.onclick=()=>{if(page>0)page--;void reload();};
    next.onclick=()=>{page++;void reload();};
    await reload();
  }
  window.PapalitaPartnerAdmin={open};
})();
