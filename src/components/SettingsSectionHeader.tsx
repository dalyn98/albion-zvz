interface Props {
  title: string
  description?: string
}

// 같은 탭 안에서 비슷한 설정들을 시각적으로 묶는 가벼운 헤더. 카드 nesting 없이
// 헤딩만 추가해 그룹 경계를 표시. SettingsGroup 처럼 카드를 두르고 싶으면 그
// 컴포넌트를 쓰고, 외곽 카드를 두를 만큼 강한 묶음이 아닐 때 이걸 쓴다.
export default function SettingsSectionHeader({ title, description }: Props) {
  return (
    <div className="pt-2 first:pt-0">
      <h2 className="font-bold text-white text-base">{title}</h2>
      {description && <p className="text-gray-500 text-xs mt-1">{description}</p>}
    </div>
  )
}
