/** USB lives on the backend computer, including when admin connects through Tailscale. */
export function wireUsbReader(api, onBusy) {
  const find=document.querySelector('#usbFind'),read=document.querySelector('#usbRead');
  const select=document.querySelector('#usbPort'),status=document.querySelector('#usbStatus');
  if(!find||!read||!select||!status)return;
  const lock=busy=>{
    onBusy(busy);find.disabled=busy;select.disabled=busy;read.disabled=busy||!select.value;
    const submit=document.querySelector('#register button[type="submit"]');if(submit)submit.disabled=busy;
    document.querySelectorAll('[data-tab],#logout,#reload').forEach(button=>{button.disabled=busy;});
  };
  select.onchange=()=>{read.disabled=!select.value;};
  find.onclick=async()=>{
    lock(true);status.textContent='Đang tìm cổng USB trên máy chạy backend…';
    select.replaceChildren(new Option('Chọn cổng USB',''));
    try{
      const response=await api('/api/admin/usb/ports');
      if(!response.enabled){status.textContent='Máy backend chưa bật công cụ đọc USB. Liên hệ người triển khai để cấu hình.';return;}
      for(const port of response.ports)select.add(new Option(`${port.device} · ${port.description}`,port.device));
      status.textContent=response.ports.length?'Chọn đúng cổng của ESP32-S3 rồi bấm Đọc MAC.':'Không thấy cổng USB. Cắm ESP32-S3 vào máy chạy backend rồi tìm lại.';
    }catch(error){status.textContent=error.message;}
    finally{lock(false);}
  };
  read.onclick=async()=>{
    if(!select.value)return;
    const port=select.value;lock(true);status.textContent=`Đang đọc ${port}… ESP32 sẽ khởi động lại, chương trình và dữ liệu được giữ nguyên.`;
    try{
      const result=await api('/api/admin/usb/read-mac','POST',{port});
      document.querySelector('[name="factoryMac"]').value=result.factoryMac;
      status.textContent=`Đã đọc ${result.chip} tại ${result.port}: ${result.factoryMac}. Nhập tên sản phẩm rồi tạo mã kích hoạt.`;
    }catch(error){status.textContent=error.message;}
    finally{lock(false);}
  };
}
