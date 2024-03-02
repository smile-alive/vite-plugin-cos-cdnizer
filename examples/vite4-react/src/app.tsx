import React from 'react';
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
	return (
		<div className='container'>
			{peoples.map((item, index) => (
				<div
					key={index}
					className='box'
					style={
						{
							'--img': `url(${item.img})`
						} as React.CSSProperties
					}
					data-name={item.name}
				/>
			))}
		</div>
	);
}
