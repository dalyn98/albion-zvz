-- 416: OC 리기어의 1번 증빙은 아이템 파괴 순간을 보여 주는 GIF다.
-- 기존 비공개 regear-screenshots 버킷과 10 MiB 제한은 유지하고 MIME 허용 목록만
-- 확장한다. 애플리케이션은 GIF magic bytes까지 검사한 뒤 service role로 업로드한다.
update storage.buckets
set allowed_mime_types = array[
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]
where id = 'regear-screenshots';
