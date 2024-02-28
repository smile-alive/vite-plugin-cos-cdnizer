import React, { useState } from 'react';
import Roboto from './assets/Roboto.svg';
import Runner from './assets/Runner.svg';
import img1 from './assets/img-1.jpg';
import img2 from './assets/img-2.jpg';
import img3 from './assets/img-3.jpg';
import img4 from './assets/img-4.jpg';
import img5 from './assets/img-5.jpg';
import './app.css';

const peoples = [
	{
		img: img1,
		name: 'Renji'
	},
	{
		img: img2,
		name: 'Sora'
	},
	{
		img: img3,
		name: 'Kaito'
	},
	{
		img: img4,
		name: 'Tsuki'
	},
	{
		img: img5,
		name: 'Mitsui'
	}
];

export default function App() {
	const [rangeValue, setRangeValue] = useState<string>('50');

	return (
		<>
			<div
				className='compare'
				style={
					{
						'--pos': `${rangeValue}%`
					} as React.CSSProperties
				}
			>
				<section className='before'>
					<img src={Runner} />
				</section>
				<section className='after'>
					<img src={Roboto} />
				</section>
				<input
					type='range'
					onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
						setRangeValue(e.target.value)
					}
				/>
			</div>
			<div className='container'>
				{peoples.map((item, index) => (
					<div
						key={index}
						className={`box box-${index + 1}`}
						style={
							{
								'--img': `url(${item.img})`
							} as React.CSSProperties
						}
						data-text={item.name}
					/>
				))}
			</div>
		</>
	);
}
